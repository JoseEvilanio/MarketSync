import { Response } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth.middleware';
import { registrarAuditoria } from '../utils/auditoria';
import { parseNFeXml } from '../services/nfe-parser.service';
import {
  identificarItensNfe,
  associarProduto,
  ItemParaIdentificar,
} from '../services/produto-identificacao.service';
import {
  confirmarRecebimento,
  estornarRecebimento,
} from '../services/recebimento.service';
import { getUploadTempDir } from '../utils/backup';

// ── Multer para XML ───────────────────────────────────────────────────────────

export const uploadXml = multer({
  dest:   getUploadTempDir(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'text/xml' ||
      file.mimetype === 'application/xml' ||
      file.originalname.toLowerCase().endsWith('.xml');
    cb(null, ok);
    if (!ok) cb(new AppError('Somente arquivos XML são aceitos', 400) as any);
  },
});

// ── Storage de XML ────────────────────────────────────────────────────────────

function getStorageDirNfe(): string {
  // Resolve relativo à raiz do backend (src/.. ou dist/..)
  return path.resolve(__dirname, '../../storage/notas-fiscais');
}

function salvarXmlEmDisco(chaveAcesso: string, xmlContent: string): string {
  const now     = new Date();
  const ano     = now.getFullYear();
  const mes     = String(now.getMonth() + 1).padStart(2, '0');
  const dir     = path.join(getStorageDirNfe(), String(ano), mes);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${chaveAcesso}.xml`);
  fs.writeFileSync(filePath, xmlContent, 'utf-8');

  // Retornar caminho relativo para armazenar no banco
  return path.join('notas-fiscais', String(ano), mes, `${chaveAcesso}.xml`);
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

export async function importar(req: AuthRequest, res: Response): Promise<void> {
  if (!req.file) throw new AppError('Arquivo XML não enviado', 400);

  let xmlContent: string;
  try {
    xmlContent = fs.readFileSync(req.file.path, 'utf-8');
  } finally {
    // Limpar arquivo temporário sempre
    try { fs.unlinkSync(req.file.path); } catch (_) {}
  }

  // Parsear XML
  const nfeParsed = parseNFeXml(xmlContent);

  // Verificar duplicidade de chave de acesso
  const existente = await (prisma as any).notaFiscalEntrada.findUnique({
    where:  { chaveAcesso: nfeParsed.chaveAcesso },
    select: { id: true, numero: true, serie: true, status: true, chaveAcesso: true },
  });
  if (existente) {
    throw new AppError(
      `NF-e já cadastrada. Chave: ${existente.chaveAcesso} | Número: ${existente.numero}-${existente.serie} | Status: ${existente.status}`,
      409
    );
  }

  // Identificar fornecedor pelo CNPJ
  const fornecedor = await prisma.fornecedor.findFirst({
    where: { cnpj: nfeParsed.emitente.cnpj, deletedAt: null },
    select: { id: true, nome: true },
  });

  const statusInicial = fornecedor ? 'AGUARDANDO_VINCULO' : 'IMPORTADA';

  // Salvar XML em disco
  const xmlPath = salvarXmlEmDisco(nfeParsed.chaveAcesso, xmlContent);

  // Persistir NF-e + itens em transação
  const nf = await prisma.$transaction(async (tx: any) => {
    const nota = await tx.notaFiscalEntrada.create({
      data: {
        fornecedorId: fornecedor?.id ?? null,
        chaveAcesso:  nfeParsed.chaveAcesso,
        numero:       nfeParsed.numero,
        serie:        nfeParsed.serie,
        dataEmissao:  nfeParsed.dataEmissao,
        dataEntrada:  nfeParsed.dataEntrada ?? null,
        valorTotal:   nfeParsed.valorTotal,
        status:       statusInicial,
        xmlPath,
        cnpjEmitente: nfeParsed.emitente.cnpj,
        nomeEmitente: nfeParsed.emitente.nome,
        itens: {
          create: nfeParsed.itens.map((item) => ({
            codigoFornecedor: item.codigoFornecedor,
            gtin:             item.gtin ?? null,
            descricao:        item.descricao,
            ncm:              item.ncm,
            cfop:             item.cfop,
            unidade:          item.unidade,
            quantidade:       item.quantidade,
            valorUnitario:    item.valorUnitario,
            desconto:         item.desconto,
            valorTotal:       item.valorTotal,
            identificado:     false,
          })),
        },
      },
      include: { itens: true },
    });

    // Tentar identificar produtos automaticamente
    if (fornecedor) {
      const paraIdentificar: ItemParaIdentificar[] = nota.itens.map((i: any) => ({
        notaFiscalItemId: i.id,
        codigoFornecedor: i.codigoFornecedor,
        gtin:             i.gtin,
        descricao:        i.descricao,
      }));

      const identificados = await identificarItensNfe(paraIdentificar, fornecedor.id, tx);

      for (const result of identificados) {
        if (result.identificado && result.produtoId) {
          await tx.notaFiscalItem.update({
            where: { id: result.notaFiscalItemId },
            data:  { produtoId: result.produtoId, identificado: true },
          });
        }
      }
    }

    return nota;
  });

  await registrarAuditoria({
    usuarioId:  req.usuario!.id,
    acao:       'IMPORTAR_NFE',
    tabela:     'notas_fiscais_entrada',
    registroId: nf.id,
    dadosDepois: {
      chaveAcesso: nfeParsed.chaveAcesso,
      numero:      nfeParsed.numero,
      fornecedor:  fornecedor?.nome ?? 'Não identificado',
    },
  });

  // Recarregar com itens atualizados
  const notaCompleta = await (prisma as any).notaFiscalEntrada.findUnique({
    where:   { id: nf.id },
    include: {
      fornecedor: true,
      itens:      { include: { produto: { select: { id: true, nome: true } } } },
    },
  });

  res.status(201).json({
    ...notaCompleta,
    fornecedorIdentificado: !!fornecedor,
    totalItens:       nfeParsed.itens.length,
    itensIdentificados: notaCompleta.itens.filter((i: any) => i.identificado).length,
  });
}

export async function listar(req: AuthRequest, res: Response): Promise<void> {
  const { page = '1', limit = '20', status, fornecedorId } = req.query as any;
  const skip  = (Number(page) - 1) * Number(limit);
  const where: any = { deletedAt: null };
  if (status)       where.status      = status;
  if (fornecedorId) where.fornecedorId = fornecedorId;

  const [notas, total] = await Promise.all([
    (prisma as any).notaFiscalEntrada.findMany({
      where,
      include: {
        fornecedor:  { select: { nome: true } },
        _count:      { select: { itens: true, divergencias: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
    }),
    (prisma as any).notaFiscalEntrada.count({ where }),
  ]);

  res.json({ data: notas, total, page: Number(page), limit: Number(limit) });
}

export async function buscarPorId(req: AuthRequest, res: Response): Promise<void> {
  const nota = await (prisma as any).notaFiscalEntrada.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: {
      fornecedor:  true,
      pedidos:     { select: { id: true, numero: true, status: true } },
      itens: {
        include: { produto: { select: { id: true, nome: true, codigoBarras: true } } },
        orderBy: { descricao: 'asc' },
      },
      divergencias: {
        orderBy: { createdAt: 'desc' },
      },
      recebimentos: {
        include: { usuario: { select: { nome: true } }, itens: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!nota) throw new AppError('Nota Fiscal não encontrada', 404);
  res.json(nota);
}

export async function vincularPedido(req: AuthRequest, res: Response): Promise<void> {
  const schema = z.object({ pedidoIds: z.array(z.string().uuid()).min(1) });
  const { pedidoIds } = schema.parse(req.body);

  const nota = await (prisma as any).notaFiscalEntrada.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });
  if (!nota) throw new AppError('Nota Fiscal não encontrada', 404);

  await (prisma as any).notaFiscalEntrada.update({
    where: { id: req.params.id },
    data: {
      status:  'EM_CONFERENCIA',
      pedidos: { connect: pedidoIds.map((id: string) => ({ id })) },
    },
  });

  // Atualizar status dos pedidos para EM_CONFERENCIA
  await (prisma as any).pedidoCompra.updateMany({
    where: { id: { in: pedidoIds }, status: { in: ['ABERTO', 'ENVIADO', 'FATURADO'] } },
    data:  { status: 'EM_CONFERENCIA' },
  });

  const notaAtualizada = await (prisma as any).notaFiscalEntrada.findUnique({
    where:   { id: req.params.id },
    include: { pedidos: true },
  });
  res.json(notaAtualizada);
}

export async function identificarProduto(req: AuthRequest, res: Response): Promise<void> {
  const schema = z.object({
    notaFiscalItemId:    z.string().uuid(),
    produtoId:           z.string().uuid(),
    salvarRelacionamento: z.boolean().default(true),
  });
  const data = schema.parse(req.body);

  const nota = await (prisma as any).notaFiscalEntrada.findFirst({
    where: { id: req.params.id, deletedAt: null },
    select: { fornecedorId: true },
  });
  if (!nota) throw new AppError('Nota Fiscal não encontrada', 404);

  const item = await (prisma as any).notaFiscalItem.findFirst({
    where: { id: data.notaFiscalItemId, notaFiscalId: req.params.id },
  });
  if (!item) throw new AppError('Item não encontrado nesta NF-e', 404);

  await associarProduto({
    notaFiscalItemId:    data.notaFiscalItemId,
    produtoId:           data.produtoId,
    fornecedorId:        nota.fornecedorId,
    codigoFornecedor:    item.codigoFornecedor,
    gtin:                item.gtin,
    descricaoFornecedor: item.descricao,
    salvarRelacionamento: data.salvarRelacionamento,
  });

  res.json({ mensagem: 'Produto associado com sucesso' });
}

export async function getConferencia(req: AuthRequest, res: Response): Promise<void> {
  const nota = await (prisma as any).notaFiscalEntrada.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: {
      fornecedor: { select: { nome: true } },
      itens: {
        include: { produto: { select: { id: true, nome: true } } },
        orderBy: { descricao: 'asc' },
      },
      pedidos: {
        include: { itens: { include: { produto: { select: { id: true, nome: true } } } } },
      },
      divergencias: { where: { status: 'PENDENTE' } },
    },
  });
  if (!nota) throw new AppError('Nota Fiscal não encontrada', 404);

  // Montar mapa produto → quantidade pedida (soma de todos os pedidos vinculados)
  const pedidoMap = new Map<string, { quantidade: number; precoUnitario: number }>();
  for (const pedido of nota.pedidos) {
    for (const pi of pedido.itens) {
      const existing = pedidoMap.get(pi.produtoId);
      if (existing) {
        existing.quantidade    += pi.quantidade;
      } else {
        pedidoMap.set(pi.produtoId, {
          quantidade:    pi.quantidade,
          precoUnitario: Number(pi.precoUnitario),
        });
      }
    }
  }

  const itensConferencia = nota.itens.map((item: any) => {
    const pedidoInfo = item.produtoId ? pedidoMap.get(item.produtoId) : null;
    let tipoDivergencia: string | null = null;

    if (pedidoInfo && item.identificado) {
      if (item.quantidade < pedidoInfo.quantidade)  tipoDivergencia = 'QUANTIDADE_MENOR';
      if (item.quantidade > pedidoInfo.quantidade)  tipoDivergencia = 'QUANTIDADE_MAIOR';
      if (Math.abs(Number(item.valorUnitario) - pedidoInfo.precoUnitario) > 0.01) {
        tipoDivergencia = tipoDivergencia ?? 'PRECO_DIFERENTE';
      }
    } else if (!item.identificado) {
      tipoDivergencia = 'PRODUTO_NAO_IDENTIFICADO';
    } else if (item.identificado && !pedidoInfo && nota.pedidos.length > 0) {
      tipoDivergencia = 'PRODUTO_NAO_SOLICITADO';
    }

    return {
      nfeItemId:        item.id,
      produtoId:        item.produtoId,
      produtoNome:      item.produto?.nome ?? null,
      codigoFornecedor: item.codigoFornecedor,
      descricaoNfe:     item.descricao,
      identificado:     item.identificado,
      quantidadePedida: pedidoInfo?.quantidade ?? null,
      quantidadeNfe:    item.quantidade,
      quantidadeReceber: item.quantidade, // padrão = qtd da NF-e
      valorUnitario:    Number(item.valorUnitario),
      tipoDivergencia,
    };
  });

  const totalDivergencias = itensConferencia.filter((i: any) => i.tipoDivergencia).length;
  const naoIdentificados  = itensConferencia.filter((i: any) => !i.identificado).length;

  res.json({
    notaFiscal: {
      id:          nota.id,
      numero:      nota.numero,
      serie:       nota.serie,
      chaveAcesso: nota.chaveAcesso,
      status:      nota.status,
      fornecedor:  nota.fornecedor,
    },
    itens:              itensConferencia,
    totalItens:         itensConferencia.length,
    totalDivergencias,
    naoIdentificados,
    podeConfirmar:      naoIdentificados === 0,
    pedidosVinculados:  nota.pedidos.map((p: any) => ({ id: p.id, numero: p.numero, status: p.status })),
  });
}

export async function receber(req: AuthRequest, res: Response): Promise<void> {
  const schema = z.object({
    itens: z.array(z.object({
      notaFiscalItemId: z.string().uuid(),
      produtoId:        z.string().uuid(),
      quantidade:       z.number().min(0.001),
      valorUnitario:    z.number().min(0),
    })).min(1),
    observacao: z.string().optional(),
  });
  const data = schema.parse(req.body);

  const recebimento = await confirmarRecebimento({
    notaFiscalId: req.params.id,
    usuarioId:    req.usuario!.id,
    itens:        data.itens,
    observacao:   data.observacao,
  });

  res.status(201).json(recebimento);
}

export async function cancelar(req: AuthRequest, res: Response): Promise<void> {
  const nota = await (prisma as any).notaFiscalEntrada.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });
  if (!nota) throw new AppError('Nota Fiscal não encontrada', 404);
  if (nota.status === 'RECEBIDA') {
    throw new AppError('NF-e já recebida. Use a opção de estorno para revertê-la.', 422);
  }

  await (prisma as any).notaFiscalEntrada.update({
    where: { id: req.params.id },
    data:  { status: 'CANCELADA', deletedAt: new Date() },
  });

  await registrarAuditoria({
    usuarioId:  req.usuario!.id,
    acao:       'CANCELAR_NFE',
    tabela:     'notas_fiscais_entrada',
    registroId: nota.id,
    dadosAntes: { status: nota.status },
  });

  res.json({ mensagem: 'NF-e cancelada' });
}

export async function estornar(req: AuthRequest, res: Response): Promise<void> {
  // Buscar recebimento mais recente da NF-e
  const recebimento = await (prisma as any).recebimento.findFirst({
    where:   { notaFiscalId: req.params.id, status: 'CONCLUIDO' },
    orderBy: { createdAt: 'desc' },
  });
  if (!recebimento) throw new AppError('Nenhum recebimento ativo encontrado para esta NF-e', 404);

  await estornarRecebimento(recebimento.id, req.usuario!.id);
  res.json({ mensagem: 'Recebimento estornado. Estoque revertido.' });
}
