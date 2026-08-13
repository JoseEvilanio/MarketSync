import { Response } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth.middleware';
import { registrarAuditoria } from '../utils/auditoria';
import { logEvent } from '../utils/logger';
import { parseNFeXml } from '../services/nfe-parser.service';
import {
  identificarItensNfe,
  associarProduto,
  ItemParaIdentificar,
} from '../services/produto-identificacao.service';
import { confirmarRecebimento, estornarRecebimento } from '../services/recebimento.service';
import { registrarEventoNfe, listarEventosNfe } from '../services/nfe-eventos.service';
import { calcularEPersistirDivergencias, classificarDivergencia } from '../services/nfe-divergencia.service';
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
    try { fs.unlinkSync(req.file.path); } catch (_) {}
  }

  // Parsear XML — agora retorna campos fiscais, hash SHA-256 e destinatário
  let nfeParsed;
  try {
    nfeParsed = parseNFeXml(xmlContent);
  } catch (err: any) {
    try {
      const { XMLParser } = require('fast-xml-parser');
      const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
      const parsed = p.parse(xmlContent);
      const raiz = Object.keys(parsed).join(', ');
      logEvent({ nivel: 'warn', modulo: 'nfe', mensagem: `Falha no parse. Tags raiz: [${raiz}]. Erro: ${err.message}` });
    } catch { /* ignora */ }
    if (err instanceof AppError) throw err;
    throw new AppError(`Falha ao processar XML: ${err.message}`, 422);
  }

  // Verificar duplicidade pela chave de acesso
  const existente = await (prisma as any).notaFiscalEntrada.findUnique({
    where:  { chaveAcesso: nfeParsed.chaveAcesso },
    select: { id: true, numero: true, serie: true, status: true, chaveAcesso: true },
  });
  if (existente) {
    throw new AppError(
      `NF-e já cadastrada. Chave: ${existente.chaveAcesso} | ` +
      `Número: ${existente.numero}-${existente.serie} | Status: ${existente.status}`,
      409
    );
  }

  // Identificar fornecedor pelo CNPJ do emitente
  const fornecedor = await prisma.fornecedor.findFirst({
    where: { cnpj: nfeParsed.emitente.cnpj, deletedAt: null },
    select: { id: true, nome: true },
  });

  const statusInicial = fornecedor ? 'AGUARDANDO_VINCULO' : 'IMPORTADA';
  const xmlPath       = salvarXmlEmDisco(nfeParsed.chaveAcesso, xmlContent);

  // Persistir NF-e + itens em transação
  const nf = await prisma.$transaction(async (tx: any) => {
    const nota = await tx.notaFiscalEntrada.create({
      data: {
        fornecedorId:     fornecedor?.id ?? null,
        chaveAcesso:      nfeParsed.chaveAcesso,
        numero:           nfeParsed.numero,
        serie:            nfeParsed.serie,
        modelo:           nfeParsed.modelo,
        dataEmissao:      nfeParsed.dataEmissao,
        dataEntrada:      nfeParsed.dataEntrada ?? null,
        dataAutorizacao:  nfeParsed.dataAutorizacao ?? null,
        protocolo:        nfeParsed.protocolo ?? null,
        situacaoFiscal:   nfeParsed.situacaoFiscal,
        valorTotal:       nfeParsed.valorTotal,
        status:           statusInicial,
        xmlPath,
        xmlHash:          nfeParsed.xmlHash,
        cnpjEmitente:     nfeParsed.emitente.cnpj,
        nomeEmitente:     nfeParsed.emitente.nome,
        destinatarioCnpj: nfeParsed.destinatario?.cnpj ?? null,
        destinatarioNome: nfeParsed.destinatario?.nome ?? null,
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
            // Campos tributários
            cest:             item.cest ?? null,
            csosn:            item.csosn ?? null,
            cst:              item.cst ?? null,
            valorIcms:        item.valorIcms || null,
            valorIpi:         item.valorIpi  || null,
            valorPis:         item.valorPis  || null,
            valorCofins:      item.valorCofins || null,
          })),
        },
      },
      include: { itens: true },
    });

    // Identificar produtos automaticamente se fornecedor foi encontrado
    if (fornecedor) {
      const paraIdentificar: ItemParaIdentificar[] = nota.itens.map((i: any) => ({
        notaFiscalItemId: i.id,
        codigoFornecedor: i.codigoFornecedor,
        gtin:             i.gtin,
        descricao:        i.descricao,
      }));
      await identificarItensNfe(paraIdentificar, fornecedor.id, tx);
    }

    return nota;
  });

  await registrarAuditoria({
    usuarioId:  req.usuario!.id,
    acao:       'IMPORTAR_NFE',
    tabela:     'notas_fiscais_entrada',
    registroId: nf.id,
    dadosDepois: {
      chaveAcesso:   nfeParsed.chaveAcesso,
      numero:        nfeParsed.numero,
      situacaoFiscal: nfeParsed.situacaoFiscal,
      fornecedor:    fornecedor?.nome ?? 'Não identificado',
    },
  });

  // Eventos fire-and-forget
  registrarEventoNfe({ nfeId: nf.id, tipo: 'NFE_IMPORTADA',
    descricao: `NF-e ${nfeParsed.numero}-${nfeParsed.serie} importada. Situação fiscal: ${nfeParsed.situacaoFiscal}`,
    usuarioId: req.usuario!.id });

  if (fornecedor) {
    registrarEventoNfe({ nfeId: nf.id, tipo: 'FORNECEDOR_IDENTIFICADO',
      descricao: `Fornecedor identificado pelo CNPJ: ${fornecedor.nome}`, usuarioId: req.usuario!.id });
  } else {
    registrarEventoNfe({ nfeId: nf.id, tipo: 'FORNECEDOR_NAO_ENCONTRADO',
      descricao: `CNPJ ${nfeParsed.emitente.cnpj} não cadastrado no sistema`, usuarioId: req.usuario!.id });
  }

  // Recarregar nota com itens identificados
  const notaCompleta = await (prisma as any).notaFiscalEntrada.findUnique({
    where:   { id: nf.id },
    include: {
      fornecedor: true,
      itens:      { include: { produto: { select: { id: true, nome: true } } } },
    },
  });

  const itensIdentificados = notaCompleta.itens.filter((i: any) => i.identificado).length;

  if (itensIdentificados > 0) {
    registrarEventoNfe({ nfeId: nf.id, tipo: 'PRODUTO_IDENTIFICADO',
      descricao: `${itensIdentificados} de ${notaCompleta.itens.length} produto(s) identificado(s) automaticamente`,
      usuarioId: req.usuario!.id, dados: { itensIdentificados, totalItens: notaCompleta.itens.length } });
  }

  // Sugerir pedidos em aberto do mesmo fornecedor
  const pedidosSugeridos = fornecedor
    ? await (prisma as any).pedidoCompra.findMany({
        where: {
          fornecedorId: fornecedor.id,
          status: { in: ['ABERTO', 'ENVIADO', 'FATURADO'] },
          deletedAt: null,
        },
        select: { id: true, numero: true, status: true, total: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })
    : [];

  res.status(201).json({
    ...notaCompleta,
    fornecedorIdentificado: !!fornecedor,
    totalItens:             nfeParsed.itens.length,
    itensIdentificados,
    pedidosSugeridos,
  });
}

export async function listar(req: AuthRequest, res: Response): Promise<void> {
  const {
    page = '1', limit = '20',
    status, situacaoFiscal, fornecedorId,
    numero, serie, chaveAcesso,
    dataEmissaoInicio, dataEmissaoFim,
    comPedido,
  } = req.query as any;

  const skip  = (Number(page) - 1) * Number(limit);
  const where: any = { deletedAt: null };

  if (status)         where.status         = status;
  if (situacaoFiscal) where.situacaoFiscal = situacaoFiscal;
  if (fornecedorId)   where.fornecedorId   = fornecedorId;
  if (numero)         where.numero         = { contains: String(numero) };
  if (serie)          where.serie          = String(serie);
  if (chaveAcesso)    where.chaveAcesso    = { contains: String(chaveAcesso).replace(/\D/g, '') };

  if (dataEmissaoInicio || dataEmissaoFim) {
    where.dataEmissao = {};
    if (dataEmissaoInicio) where.dataEmissao.gte = new Date(dataEmissaoInicio);
    if (dataEmissaoFim)    where.dataEmissao.lte = new Date(dataEmissaoFim + 'T23:59:59');
  }

  if (comPedido === 'true')  where.nfePedidos = { some: {} };
  if (comPedido === 'false') where.nfePedidos = { none: {} };

  const [notas, total] = await Promise.all([
    (prisma as any).notaFiscalEntrada.findMany({
      where,
      include: {
        fornecedor: { select: { nome: true, cnpj: true } },
        _count:     { select: { itens: true, divergencias: true, nfePedidos: true } },
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
      fornecedor: true,
      nfePedidos: {
        include: {
          pedido:      { select: { id: true, numero: true, status: true, total: true } },
          vinculadoPor: { select: { nome: true } },
        },
        orderBy: { dataVinculacao: 'asc' },
      },
      itens: {
        include: { produto: { select: { id: true, nome: true, codigoBarras: true } } },
        orderBy: { descricao: 'asc' },
      },
      divergencias: { orderBy: { createdAt: 'desc' } },
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
  const schema = z.object({
    pedidoIds:  z.array(z.string().uuid()).min(1),
    observacao: z.string().optional(),
  });
  const { pedidoIds, observacao } = schema.parse(req.body);

  const nota = await (prisma as any).notaFiscalEntrada.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });
  if (!nota) throw new AppError('Nota Fiscal não encontrada', 404);

  // Criar NfePedido explícito para cada pedido (com metadados)
  for (const pedidoId of pedidoIds) {
    const existeVinculo = await (prisma as any).nfePedido.findFirst({
      where: { nfeId: req.params.id, pedidoId },
    });
    if (!existeVinculo) {
      await (prisma as any).nfePedido.create({
        data: {
          nfeId:          req.params.id,
          pedidoId,
          vinculadoPorId: req.usuario!.id,
          dataVinculacao: new Date(),
          observacao:     observacao ?? null,
        },
      });
    }
  }

  // Atualizar status dos pedidos (ENVIADO/ABERTO → FATURADO; FATURADO → EM_CONFERENCIA)
  const pedidosEnviadosOuAbertos = await (prisma as any).pedidoCompra.findMany({
    where: { id: { in: pedidoIds }, status: { in: ['ABERTO', 'ENVIADO'] }, deletedAt: null },
    select: { id: true },
  });
  if (pedidosEnviadosOuAbertos.length > 0) {
    await (prisma as any).pedidoCompra.updateMany({
      where: { id: { in: pedidosEnviadosOuAbertos.map((p: any) => p.id) } },
      data:  { status: 'FATURADO' },
    });
  }
  // FATURADO → EM_CONFERENCIA quando NF-e é vinculada
  await (prisma as any).pedidoCompra.updateMany({
    where: { id: { in: pedidoIds }, status: 'FATURADO', deletedAt: null },
    data:  { status: 'EM_CONFERENCIA' },
  });

  // Calcular e persistir divergências automaticamente
  const resumo = await calcularEPersistirDivergencias(req.params.id);

  // Atualizar status da NF-e
  const novoStatus = resumo.bloqueantes > 0 ? 'COM_DIVERGENCIA' : 'EM_CONFERENCIA';
  await (prisma as any).notaFiscalEntrada.update({
    where: { id: req.params.id },
    data:  { status: novoStatus },
  });

  // Eventos
  registrarEventoNfe({
    nfeId:     req.params.id,
    tipo:      'PEDIDO_VINCULADO',
    descricao: `${pedidoIds.length} pedido(s) vinculado(s). ${resumo.total} divergência(s) detectada(s) (${resumo.bloqueantes} bloqueante(s))`,
    usuarioId: req.usuario!.id,
    dados:     { pedidoIds, resumoDivergencias: resumo },
  });
  if (resumo.total > 0) {
    registrarEventoNfe({
      nfeId: req.params.id, tipo: 'DIVERGENCIA_DETECTADA',
      descricao: `${resumo.bloqueantes} bloqueante(s) e ${resumo.alertas} alerta(s) detectado(s)`,
      usuarioId: req.usuario!.id,
      dados: { bloqueantes: resumo.bloqueantes, alertas: resumo.alertas, total: resumo.total },
    });
  }

  const notaAtualizada = await (prisma as any).notaFiscalEntrada.findUnique({
    where:   { id: req.params.id },
    include: { nfePedidos: { include: { pedido: true } } },
  });
  res.json({ ...notaAtualizada, resumoDivergencias: resumo });
}

export async function identificarProduto(req: AuthRequest, res: Response): Promise<void> {
  const schema = z.object({
    notaFiscalItemId:     z.string().uuid(),
    produtoId:            z.string().uuid(),
    salvarRelacionamento: z.boolean().default(true),
  });
  const data = schema.parse(req.body);

  const nota = await (prisma as any).notaFiscalEntrada.findFirst({
    where: { id: req.params.id, deletedAt: null },
    select: { fornecedorId: true, chaveAcesso: true, numero: true },
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

  // Auditoria e Evento (CA-10 / Seção 22)
  await registrarAuditoria({
    usuarioId:   req.usuario!.id,
    acao:        'PRODUTO_ASSOCIADO_NFE',
    tabela:      'notas_fiscais_itens',
    registroId:  data.notaFiscalItemId,
    dadosDepois: {
      notaFiscalId: req.params.id,
      chaveAcesso:  nota.chaveAcesso,
      produtoId:    data.produtoId,
      gtin:         item.gtin,
      descricaoNfe: item.descricao,
    },
  });

  registrarEventoNfe({
    nfeId:     req.params.id,
    tipo:      'PRODUTO_IDENTIFICADO',
    descricao: `Produto associado manualmente: ${item.descricao}`,
    usuarioId: req.usuario!.id,
  });

  // Recalcular divergências
  await calcularEPersistirDivergencias(req.params.id);

  res.json({ mensagem: 'Produto associado com sucesso' });
}

export async function cadastrarEAssociarProduto(req: AuthRequest, res: Response): Promise<void> {
  const optionalUuid = z.preprocess(
    (val) => (val === '' || val === null ? null : val),
    z.string().uuid().nullable().optional()
  );
  const optionalString = z.preprocess(
    (val) => (val === '' || val === null ? null : val),
    z.string().nullable().optional()
  );
  const optionalNumber = z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : val),
    z.coerce.number().nullable().optional()
  );

  const schema = z.object({
    notaFiscalItemId:     z.string().uuid(),
    nome:                 z.string().min(2, 'Nome do produto é obrigatório'),
    codigoBarras:         optionalString,
    codigoInterno:        optionalString,
    unidade:              z.string().default('UN'),
    precoCompra:          z.coerce.number().min(0).default(0),
    precoVenda:           z.coerce.number().min(0),
    categoriaId:          optionalUuid,
    estoqueMinimo:        optionalNumber.transform(val => val ?? 0),
    salvarRelacionamento: z.boolean().default(true),
  });

  const data = schema.parse(req.body);

  const nota = await (prisma as any).notaFiscalEntrada.findFirst({
    where: { id: req.params.id, deletedAt: null },
    select: { fornecedorId: true, chaveAcesso: true, numero: true },
  });
  if (!nota) throw new AppError('Nota Fiscal não encontrada', 404);

  const item = await (prisma as any).notaFiscalItem.findFirst({
    where: { id: data.notaFiscalItemId, notaFiscalId: req.params.id },
  });
  if (!item) throw new AppError('Item não encontrado nesta NF-e', 404);

  // Validação de EAN duplicado (Seção 23 / CA-06)
  const eanLimpo = data.codigoBarras?.trim();
  if (eanLimpo && eanLimpo !== '' && eanLimpo.toUpperCase() !== 'SEM GTIN') {
    const produtoExistente = await prisma.produto.findFirst({
      where:  { codigoBarras: eanLimpo, deletedAt: null },
      select: { id: true, nome: true, codigoInterno: true, codigoBarras: true, estoqueAtual: true },
    });
    if (produtoExistente) {
      throw new AppError(
        `EAN ${eanLimpo} já cadastrado no sistema para o produto "${produtoExistente.nome}" (Cód. ${produtoExistente.codigoInterno || 'S/N'}).`,
        409,
        { produtoExistente }
      );
    }
  }

  // Preço de compra / margem
  const precoCompra = data.precoCompra || Number(item.valorUnitario) || 0;
  let margemLucro: number | undefined = undefined;
  if (precoCompra > 0 && data.precoVenda > 0) {
    margemLucro = ((data.precoVenda - precoCompra) / data.precoVenda) * 100;
  }

  // Criar o produto com estoqueAtual = 0 (Seção 10: estoque somente atualizado ao confirmar recebimento)
  const novoProduto = await prisma.produto.create({
    data: {
      nome:          data.nome,
      codigoBarras:  (eanLimpo && eanLimpo.toUpperCase() !== 'SEM GTIN') ? eanLimpo : null,
      codigoInterno: data.codigoInterno?.trim() || null,
      unidade:       data.unidade || item.unidade || 'UN',
      precoCompra:   precoCompra,
      precoVenda:    data.precoVenda,
      margemLucro:   margemLucro,
      categoriaId:   data.categoriaId || null,
      fornecedorId:  nota.fornecedorId || null,
      estoqueAtual:  0, // Regulagem estrita: cadastro NÃO insere estoque diretamente
      estoqueMinimo: data.estoqueMinimo || 0,
      ativo:         true,
    },
    include: { categoria: true },
  });

  // Realizar associação do item da NF-e com o novo produto
  await associarProduto({
    notaFiscalItemId:    data.notaFiscalItemId,
    produtoId:           novoProduto.id,
    fornecedorId:        nota.fornecedorId,
    codigoFornecedor:    item.codigoFornecedor,
    gtin:                item.gtin,
    descricaoFornecedor: item.descricao,
    salvarRelacionamento: data.salvarRelacionamento,
  });

  // Auditoria (CA-10 / Seção 22)
  await registrarAuditoria({
    usuarioId:   req.usuario!.id,
    acao:        'NOVO_PRODUTO_CADASTRADO_NFE',
    tabela:      'produtos',
    registroId:  novoProduto.id,
    dadosDepois: {
      notaFiscalId:     req.params.id,
      chaveAcesso:      nota.chaveAcesso,
      produtoId:        novoProduto.id,
      produtoNome:      novoProduto.nome,
      codigoInterno:    novoProduto.codigoInterno,
      ean:              novoProduto.codigoBarras,
      itemNfeDescricao: item.descricao,
    },
  });

  // Evento na NF-e
  registrarEventoNfe({
    nfeId:     req.params.id,
    tipo:      'PRODUTO_IDENTIFICADO',
    descricao: `Novo produto criado e associado: ${novoProduto.nome} (ID ${novoProduto.id})`,
    usuarioId: req.usuario!.id,
  });

  // Recalcular divergências
  await calcularEPersistirDivergencias(req.params.id);

  res.status(201).json({
    mensagem: 'Produto cadastrado e associado com sucesso',
    produto:  novoProduto,
  });
}

export async function getConferencia(req: AuthRequest, res: Response): Promise<void> {
  const nota = await (prisma as any).notaFiscalEntrada.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: {
      fornecedor: { select: { id: true, nome: true, cnpj: true } },
      itens: {
        include: {
          produto: { select: { id: true, nome: true, codigoBarras: true, codigoInterno: true } },
        },
        orderBy: { descricao: 'asc' },
      },
      nfePedidos: {
        include: {
          pedido: {
            include: { itens: { include: { produto: { select: { id: true, nome: true } } } } },
          },
        },
      },
      divergencias: { orderBy: { tipo: 'asc' } },
    },
  });
  if (!nota) throw new AppError('Nota Fiscal não encontrada', 404);

  // Mapa produto → pedido (soma de todos os pedidos vinculados via NfePedido)
  const pedidos = (nota.nfePedidos ?? []).map((np: any) => np.pedido);
  const pedidoMap = new Map<string, { quantidade: number; precoUnitario: number }>();
  for (const pedido of pedidos) {
    for (const pi of pedido.itens) {
      const ex = pedidoMap.get(pi.produtoId);
      if (ex) { ex.quantidade += pi.quantidade; }
      else     { pedidoMap.set(pi.produtoId, { quantidade: pi.quantidade, precoUnitario: Number(pi.precoUnitario) }); }
    }
  }

  // Mapa de divergências persistidas por (produtoId + tipo)
  const divMap = new Map<string, any>();
  for (const d of nota.divergencias) {
    divMap.set(`${d.produtoId ?? 'null'}_${d.tipo}`, d);
  }

  const itensConferencia = nota.itens.map((item: any) => {
    const pedidoInfo = item.produtoId ? pedidoMap.get(item.produtoId) : null;

    // Determinar divergência do banco (persistida) ou calcular inline
    let tipoDivergencia: string | null = null;
    let classificacao:   string | null = null;

    if (!item.identificado) {
      tipoDivergencia = 'PRODUTO_NAO_IDENTIFICADO';
      classificacao   = 'BLOQUEANTE';
    } else if (item.identificado && !pedidoInfo && pedidos.length > 0) {
      tipoDivergencia = 'PRODUTO_NAO_SOLICITADO';
      classificacao   = 'ALERTA';
    } else if (pedidoInfo) {
      const difQtd   = Math.abs(item.quantidade - pedidoInfo.quantidade);
      const difPreco = Math.abs(Number(item.valorUnitario) - pedidoInfo.precoUnitario);
      if (difQtd > 0.001) {
        tipoDivergencia = item.quantidade < pedidoInfo.quantidade ? 'QUANTIDADE_MENOR' : 'QUANTIDADE_MAIOR';
        classificacao   = 'ALERTA';
      } else if (difPreco > 0.01) {
        tipoDivergencia = 'PRECO_DIFERENTE';
        classificacao   = 'ALERTA';
      }
    }

    const divPersistida = tipoDivergencia
      ? divMap.get(`${item.produtoId ?? 'null'}_${tipoDivergencia}`)
      : null;

    return {
      nfeItemId:            item.id,
      produtoId:            item.produtoId,
      produtoNome:          item.produto?.nome ?? null,
      codigoInternoProduto: item.produto?.codigoInterno ?? null,
      codigoBarrasProduto:  item.produto?.codigoBarras ?? null,
      codigoFornecedor:     item.codigoFornecedor,
      gtin:                 item.gtin ?? null,
      descricaoNfe:         item.descricao,
      unidade:              item.unidade,
      ncm:                  item.ncm,
      cest:                 item.cest,
      identificado:         item.identificado,
      statusIdentificacao:  item.statusIdentificacao,
      quantidadePedida:     pedidoInfo?.quantidade ?? null,
      quantidadeNfe:        item.quantidade,
      quantidadeReceber:    item.quantidade,
      valorUnitario:        Number(item.valorUnitario),
      tipoDivergencia,
      classificacao,
      divergenciaId:        divPersistida?.id ?? null,
      divergenciaStatus:    divPersistida?.status ?? null,
    };
  });

  // Adicionar itens PRODUTO_FALTANTE (pedido sem NF-e)
  const produtosNaNfe = new Set(nota.itens.map((i: any) => i.produtoId).filter(Boolean));
  const itensFaltantes: any[] = [];
  for (const [produtoId, info] of pedidoMap.entries()) {
    if (!produtosNaNfe.has(produtoId)) {
      const div = divMap.get(`${produtoId}_PRODUTO_FALTANTE`);
      const produto = nota.itens.find((i: any) => i.produtoId === produtoId)?.produto;
      itensFaltantes.push({
        nfeItemId:        null,
        produtoId,
        produtoNome:      produto?.nome ?? produtoId,
        codigoFornecedor: '—',
        descricaoNfe:     '(produto faltante na NF-e)',
        identificado:     true,
        quantidadePedida: info.quantidade,
        quantidadeNfe:    0,
        quantidadeReceber: 0,
        valorUnitario:    info.precoUnitario,
        tipoDivergencia:  'PRODUTO_FALTANTE',
        classificacao:    'ALERTA',
        divergenciaId:    div?.id ?? null,
        divergenciaStatus: div?.status ?? null,
      });
    }
  }

  const todos = [...itensConferencia, ...itensFaltantes];
  const bloqueantes  = todos.filter((i) => i.classificacao === 'BLOQUEANTE').length;
  const alertas      = todos.filter((i) => i.classificacao === 'ALERTA').length;
  const identificados = todos.filter((i) => i.identificado).length;

  // Registrar evento de conferência iniciada (uma vez)
  const jaIniciou = nota.divergencias.length > 0 ||
    (nota.status === 'EM_CONFERENCIA' || nota.status === 'COM_DIVERGENCIA');
  if (!jaIniciou) {
    registrarEventoNfe({
      nfeId: req.params.id, tipo: 'CONFERENCIA_INICIADA',
      descricao: 'Conferência de itens iniciada', usuarioId: req.usuario!.id,
    });
  }

  res.json({
    notaFiscal: {
      id:            nota.id,
      numero:        nota.numero,
      serie:         nota.serie,
      chaveAcesso:   nota.chaveAcesso,
      status:        nota.status,
      situacaoFiscal: nota.situacaoFiscal,
      fornecedor:    nota.fornecedor,
    },
    itens:             todos,
    totalItens:        todos.length,
    identificados,
    divergenciasAlerta:     alertas,
    divergenciasBloqueantes: bloqueantes,
    podeConfirmar:     bloqueantes === 0 && todos.some((i) => i.quantidadeReceber > 0),
    pedidosVinculados: pedidos.map((p: any) => ({ id: p.id, numero: p.numero, status: p.status })),
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
    usuarioId: req.usuario!.id, acao: 'CANCELAR_NFE',
    tabela: 'notas_fiscais_entrada', registroId: nota.id,
    dadosAntes: { status: nota.status },
  });

  registrarEventoNfe({
    nfeId: req.params.id, tipo: 'NFE_CANCELADA',
    descricao: 'NF-e cancelada no sistema', usuarioId: req.usuario!.id,
  });

  res.json({ mensagem: 'NF-e cancelada' });
}

export async function estornar(req: AuthRequest, res: Response): Promise<void> {
  const recebimento = await (prisma as any).recebimento.findFirst({
    where: { notaFiscalId: req.params.id, status: 'CONCLUIDO' },
    orderBy: { createdAt: 'desc' },
  });
  if (!recebimento) throw new AppError('Nenhum recebimento ativo encontrado para esta NF-e', 404);

  await estornarRecebimento(recebimento.id, req.usuario!.id);
  res.json({ mensagem: 'Recebimento estornado. Estoque revertido.' });
}

// ── Novos endpoints ───────────────────────────────────────────────────────────

/** GET /notas-fiscais/:id/eventos — linha do tempo da NF-e */
export async function listarEventos(req: AuthRequest, res: Response): Promise<void> {
  const nota = await (prisma as any).notaFiscalEntrada.findFirst({
    where: { id: req.params.id, deletedAt: null },
    select: { id: true },
  });
  if (!nota) throw new AppError('Nota Fiscal não encontrada', 404);

  const eventos = await listarEventosNfe(req.params.id);
  res.json(eventos);
}

/** GET /notas-fiscais/chave/:chave — busca direta pela chave de acesso */
export async function buscarPorChave(req: AuthRequest, res: Response): Promise<void> {
  const chave = String(req.params.chave).replace(/\D/g, '');
  if (chave.length !== 44) {
    throw new AppError('Chave de acesso inválida — deve ter 44 dígitos numéricos', 400);
  }

  const nota = await (prisma as any).notaFiscalEntrada.findUnique({
    where: { chaveAcesso: chave },
    include: {
      fornecedor: { select: { nome: true, cnpj: true } },
      _count:     { select: { itens: true, divergencias: true } },
    },
  });
  if (!nota) throw new AppError('NF-e não encontrada para esta chave de acesso', 404);
  res.json(nota);
}

/** GET /notas-fiscais/:id/xml — download do XML com verificação de integridade */
export async function downloadXml(req: AuthRequest, res: Response): Promise<void> {
  const nota = await (prisma as any).notaFiscalEntrada.findFirst({
    where:  { id: req.params.id, deletedAt: null },
    select: { xmlPath: true, xmlHash: true, chaveAcesso: true, numero: true, serie: true },
  });
  if (!nota) throw new AppError('Nota Fiscal não encontrada', 404);
  if (!nota.xmlPath) throw new AppError('XML não disponível para esta NF-e', 404);

  const storagePath = path.resolve(__dirname, '../../storage');
  const filePath    = path.join(storagePath, nota.xmlPath);

  if (!fs.existsSync(filePath)) {
    throw new AppError('Arquivo XML não encontrado no servidor', 404);
  }

  // Verificar integridade do arquivo via hash SHA-256
  if (nota.xmlHash) {
    const conteudo     = fs.readFileSync(filePath);
    const hashAtual    = crypto.createHash('sha256').update(conteudo).digest('hex');
    const integroHeader = hashAtual === nota.xmlHash ? 'ok' : 'divergente';
    res.setHeader('X-Xml-Integridade', integroHeader);
    if (integroHeader === 'divergente') {
      logEvent({ nivel: 'warn', modulo: 'nfe', mensagem: `Hash divergente para NF-e ${nota.chaveAcesso}` });
    }
  }

  const nomeArquivo = `NF-e_${nota.numero}-${nota.serie}_${nota.chaveAcesso}.xml`;
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
  fs.createReadStream(filePath).pipe(res);
}
