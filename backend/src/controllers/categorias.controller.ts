import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth.middleware';

const optionalString = z.preprocess(
  (val) => (val === '' || val === null ? null : val),
  z.string().nullable().optional()
);

const schema = z.object({
  nome: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  descricao: optionalString,
  ativo: z.boolean().default(true),
});

export async function listar(_req: AuthRequest, res: Response): Promise<void> {
  const categorias = await prisma.categoria.findMany({
    where: { deletedAt: null },
    orderBy: { nome: 'asc' },
    include: { _count: { select: { produtos: true } } },
  });
  res.json(categorias);
}

export async function criar(req: AuthRequest, res: Response): Promise<void> {
  const data = schema.parse(req.body);
  const categoria = await prisma.categoria.create({ data });
  res.status(201).json(categoria);
}

export async function atualizar(req: AuthRequest, res: Response): Promise<void> {
  const data = schema.partial().parse(req.body);
  const categoria = await prisma.categoria.update({ where: { id: req.params.id }, data });
  res.json(categoria);
}

export async function remover(req: AuthRequest, res: Response): Promise<void> {
  const emUso = await prisma.produto.count({
    where: { categoriaId: req.params.id, deletedAt: null },
  });
  if (emUso > 0) throw new AppError('Categoria em uso por produtos', 409);

  await prisma.categoria.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });
  res.status(204).send();
}
