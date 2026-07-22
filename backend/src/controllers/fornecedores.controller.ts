import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth.middleware';

const fornecedorSchema = z.object({
  nome: z.string().min(2),
  razaoSocial: z.string().optional(),
  cnpj: z.string().optional(),
  telefone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  endereco: z.string().optional(),
  cidade: z.string().optional(),
  bairro: z.string().optional(),
  contato: z.string().optional(),
  ativo: z.boolean().default(true),
});

export async function listar(req: AuthRequest, res: Response): Promise<void> {
  const { q, page = '1', limit = '50' } = req.query as any;
  const where: any = { deletedAt: null };
  if (q) {
    where.OR = [
      { nome: { contains: q, mode: 'insensitive' } },
      { cnpj: { contains: q } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [fornecedores, total] = await Promise.all([
    prisma.fornecedor.findMany({ where, orderBy: { nome: 'asc' }, skip, take: Number(limit) }),
    prisma.fornecedor.count({ where }),
  ]);

  res.json({ data: fornecedores, total, page: Number(page), limit: Number(limit) });
}

export async function buscarPorId(req: AuthRequest, res: Response): Promise<void> {
  const fornecedor = await prisma.fornecedor.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { compras: { take: 5, orderBy: { createdAt: 'desc' } } },
  });
  if (!fornecedor) throw new AppError('Fornecedor não encontrado', 404);
  res.json(fornecedor);
}

export async function criar(req: AuthRequest, res: Response): Promise<void> {
  const data = fornecedorSchema.parse(req.body);
  const fornecedor = await prisma.fornecedor.create({ data: data as any });
  res.status(201).json(fornecedor);
}

export async function atualizar(req: AuthRequest, res: Response): Promise<void> {
  const data = fornecedorSchema.partial().parse(req.body);
  const fornecedor = await prisma.fornecedor.update({
    where: { id: req.params.id },
    data: data as any,
  });
  res.json(fornecedor);
}

export async function remover(req: AuthRequest, res: Response): Promise<void> {
  await prisma.fornecedor.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });
  res.status(204).send();
}
