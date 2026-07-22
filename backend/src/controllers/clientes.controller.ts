import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth.middleware';

const clienteSchema = z.object({
  nome: z.string().min(2),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
  whatsapp: z.string().optional(),
  endereco: z.string().optional(),
  cidade: z.string().optional(),
  bairro: z.string().optional(),
  limiteCredito: z.number().min(0).default(0),
  observacoes: z.string().optional(),
  ativo: z.boolean().default(true),
});

export async function listar(req: AuthRequest, res: Response): Promise<void> {
  const { q, page = '1', limit = '50' } = req.query as any;
  const where: any = { deletedAt: null };
  if (q) {
    where.OR = [
      { nome: { contains: q, mode: 'insensitive' } },
      { cpf: { contains: q } },
      { telefone: { contains: q } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [clientes, total] = await Promise.all([
    prisma.cliente.findMany({ where, orderBy: { nome: 'asc' }, skip, take: Number(limit) }),
    prisma.cliente.count({ where }),
  ]);

  res.json({ data: clientes, total, page: Number(page), limit: Number(limit) });
}

export async function buscarPorId(req: AuthRequest, res: Response): Promise<void> {
  const cliente = await prisma.cliente.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: {
      vendas: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, numero: true, total: true, createdAt: true, status: true },
      },
    },
  });
  if (!cliente) throw new AppError('Cliente não encontrado', 404);
  res.json(cliente);
}

export async function criar(req: AuthRequest, res: Response): Promise<void> {
  const data = clienteSchema.parse(req.body);

  if (data.cpf) {
    const existe = await prisma.cliente.findFirst({ where: { cpf: data.cpf, deletedAt: null } });
    if (existe) throw new AppError('CPF já cadastrado', 409);
  }

  const cliente = await prisma.cliente.create({ data: data as any });
  res.status(201).json(cliente);
}

export async function atualizar(req: AuthRequest, res: Response): Promise<void> {
  const data = clienteSchema.partial().parse(req.body);
  const cliente = await prisma.cliente.update({ where: { id: req.params.id }, data: data as any });
  res.json(cliente);
}

export async function remover(req: AuthRequest, res: Response): Promise<void> {
  await prisma.cliente.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });
  res.status(204).send();
}
