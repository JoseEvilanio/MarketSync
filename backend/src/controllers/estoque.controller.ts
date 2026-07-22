import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth.middleware';
import { registrarAuditoria } from '../utils/auditoria';

const ajusteSchema = z.object({
  produtoId: z.string().uuid(),
  tipo: z.enum([
    'ENTRADA_COMPRA',
    'ENTRADA_AJUSTE',
    'ENTRADA_DEVOLUCAO',
    'SAIDA_PERDA',
    'SAIDA_CONSUMO',
    'SAIDA_AJUSTE',
  ]),
  quantidade: z.number().min(0.001),
  motivo: z.string().optional(),
});

export async function ajustarEstoque(req: AuthRequest, res: Response): Promise<void> {
  const data = ajusteSchema.parse(req.body);

  const produto = await prisma.produto.findFirst({
    where: { id: data.produtoId, deletedAt: null },
  });
  if (!produto) throw new AppError('Produto não encontrado', 404);

  const isEntrada = data.tipo.startsWith('ENTRADA');
  const saldoAntes = produto.estoqueAtual;
  const saldoDepois = isEntrada
    ? saldoAntes + data.quantidade
    : saldoAntes - data.quantidade;

  if (saldoDepois < 0) throw new AppError('Estoque insuficiente para este ajuste', 422);

  await prisma.$transaction(async (tx) => {
    await tx.produto.update({
      where: { id: data.produtoId },
      data: { estoqueAtual: saldoDepois },
    });

    await tx.movimentoEstoque.create({
      data: {
        produtoId: data.produtoId,
        tipo: data.tipo,
        quantidade: data.quantidade,
        saldoAntes,
        saldoDepois,
        motivo: data.motivo || 'Ajuste manual',
      },
    });
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    acao: 'AJUSTE_ESTOQUE',
    tabela: 'produtos',
    registroId: data.produtoId,
    dadosAntes: { estoqueAtual: saldoAntes },
    dadosDepois: { estoqueAtual: saldoDepois, tipo: data.tipo, motivo: data.motivo },
  });

  res.json({ saldoAntes, saldoDepois, produto: { id: produto.id, nome: produto.nome } });
}

export async function historico(req: AuthRequest, res: Response): Promise<void> {
  const { produtoId, page = '1', limit = '50' } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = {};
  if (produtoId) where.produtoId = produtoId;

  const [movimentos, total] = await Promise.all([
    prisma.movimentoEstoque.findMany({
      where,
      include: { produto: { select: { nome: true, codigoBarras: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
    }),
    prisma.movimentoEstoque.count({ where }),
  ]);

  res.json({ data: movimentos, total, page: Number(page), limit: Number(limit) });
}

export async function produtosEstoqueBaixo(_req: AuthRequest, res: Response): Promise<void> {
  const produtos = await prisma.produto.findMany({
    where: {
      deletedAt: null,
      ativo: true,
      estoqueAtual: { lte: prisma.produto.fields.estoqueMinimo },
    },
    include: { categoria: true, fornecedor: { select: { nome: true } } },
    orderBy: { estoqueAtual: 'asc' },
  });

  // Filtrar manualmente por query (Prisma não suporta comparação entre campos diretamente em todos os casos)
  const resultado = await prisma.$queryRaw<any[]>`
    SELECT p.id, p.nome, p."codigoBarras", p."estoqueAtual", p."estoqueMinimo",
           c.nome as "categoriaNome", f.nome as "fornecedorNome"
    FROM produtos p
    LEFT JOIN categorias c ON c.id = p."categoriaId"
    LEFT JOIN fornecedores f ON f.id = p."fornecedorId"
    WHERE p."deletedAt" IS NULL
      AND p.ativo = true
      AND p."estoqueAtual" <= p."estoqueMinimo"
    ORDER BY (p."estoqueAtual" - p."estoqueMinimo") ASC
  `;

  res.json(resultado);
}

export async function inventario(req: AuthRequest, res: Response): Promise<void> {
  const { q, categoriaId } = req.query as any;
  const where: any = { deletedAt: null, ativo: true };
  if (q) where.OR = [{ nome: { contains: q, mode: 'insensitive' } }, { codigoBarras: { contains: q } }];
  if (categoriaId) where.categoriaId = categoriaId;

  const produtos = await prisma.produto.findMany({
    where,
    select: {
      id: true,
      codigoInterno: true,
      codigoBarras: true,
      nome: true,
      unidade: true,
      estoqueAtual: true,
      estoqueMinimo: true,
      categoria: { select: { nome: true } },
    },
    orderBy: { nome: 'asc' },
  });

  res.json(produtos);
}
