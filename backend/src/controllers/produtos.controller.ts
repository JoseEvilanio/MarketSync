import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth.middleware';

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

const produtoSchema = z.object({
  codigoInterno: optionalString,
  codigoBarras: optionalString,
  nome: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  descricao: optionalString,
  categoriaId: optionalUuid,
  marcaId: optionalUuid,
  fornecedorId: optionalUuid,
  unidade: z.string().default('UN'),
  tipoVenda: z.enum(['UNIDADE', 'PESO']).default('UNIDADE'),
  modoPesagem: z.enum(['MANUAL', 'CODIGO_BARRAS_BALANCA']).default('MANUAL'),
  peso: optionalNumber,
  precoCompra: z.coerce.number().min(0).default(0),
  precoVenda: z.coerce.number().min(0),
  margemLucro: optionalNumber,
  estoqueAtual: z.coerce.number().default(0),
  estoqueMinimo: z.coerce.number().default(0),
  localizacao: optionalString,
  ativo: z.boolean().default(true),
});

export async function listar(req: AuthRequest, res: Response): Promise<void> {
  const { q, categoriaId, fornecedorId, ativo, page = '1', limit = '50' } = req.query as any;

  const where: any = { deletedAt: null };
  if (q) {
    where.OR = [
      { nome: { contains: q, mode: 'insensitive' } },
      { codigoBarras: { contains: q } },
      { codigoInterno: { contains: q } },
    ];
  }
  if (categoriaId) where.categoriaId = categoriaId;
  if (fornecedorId) where.fornecedorId = fornecedorId;
  if (ativo !== undefined) where.ativo = ativo === 'true';

  const skip = (Number(page) - 1) * Number(limit);

  const [produtos, total] = await Promise.all([
    prisma.produto.findMany({
      where,
      include: { categoria: true, marca: true, fornecedor: { select: { id: true, nome: true } } },
      orderBy: { nome: 'asc' },
      skip,
      take: Number(limit),
    }),
    prisma.produto.count({ where }),
  ]);

  res.json({ data: produtos, total, page: Number(page), limit: Number(limit) });
}

export async function buscarPorBarras(req: AuthRequest, res: Response): Promise<void> {
  const { codigo } = req.params;

  const produto = await prisma.produto.findFirst({
    where: {
      deletedAt: null,
      ativo: true,
      OR: [{ codigoBarras: codigo }, { codigoInterno: codigo }],
    },
    include: { categoria: true },
  });

  if (!produto) throw new AppError('Produto não encontrado', 404);

  res.json(produto);
}

export async function buscarPorId(req: AuthRequest, res: Response): Promise<void> {
  const produto = await prisma.produto.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { categoria: true, marca: true, fornecedor: true },
  });
  if (!produto) throw new AppError('Produto não encontrado', 404);
  res.json(produto);
}

export async function criar(req: AuthRequest, res: Response): Promise<void> {
  const data = produtoSchema.parse(req.body);

  // Calcular margem automaticamente se não fornecida
  if (!data.margemLucro && data.precoCompra && data.precoCompra > 0 && data.precoVenda > 0) {
    data.margemLucro = ((data.precoVenda - data.precoCompra) / data.precoVenda) * 100;
  }

  const produto = await prisma.produto.create({
    data: data as any,
    include: { categoria: true, marca: true, fornecedor: { select: { id: true, nome: true } } },
  });
  res.status(201).json(produto);
}

export async function atualizar(req: AuthRequest, res: Response): Promise<void> {
  const data = produtoSchema.partial().parse(req.body);

  const produto = await prisma.produto.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });
  if (!produto) throw new AppError('Produto não encontrado', 404);

  // Re-calcular margem de lucro se preços alteraram e margem não enviada explicitamente
  const precoVenda = data.precoVenda ?? Number(produto.precoVenda);
  const precoCompra = data.precoCompra ?? Number(produto.precoCompra);
  if (data.margemLucro === undefined && precoCompra > 0 && precoVenda > 0) {
    data.margemLucro = ((precoVenda - precoCompra) / precoVenda) * 100;
  }

  const atualizado = await prisma.produto.update({
    where: { id: req.params.id },
    data: data as any,
    include: { categoria: true, marca: true, fornecedor: { select: { id: true, nome: true } } },
  });

  res.json(atualizado);
}

export async function remover(req: AuthRequest, res: Response): Promise<void> {
  const produto = await prisma.produto.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });
  if (!produto) throw new AppError('Produto não encontrado', 404);

  await prisma.produto.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });

  res.status(204).send();
}

export async function alteracaoEmMassa(req: AuthRequest, res: Response): Promise<void> {
  const schema = z.object({
    ids: z.array(z.string().uuid()),
    campo: z.enum(['precoVenda', 'precoCompra', 'margemLucro', 'categoriaId', 'ativo']),
    valor: z.union([z.string(), z.number(), z.boolean()]),
  });

  const { ids, campo, valor } = schema.parse(req.body);

  await prisma.produto.updateMany({
    where: { id: { in: ids } },
    data: { [campo]: valor } as any,
  });

  res.json({ mensagem: `${ids.length} produto(s) atualizado(s)` });
}
