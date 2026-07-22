import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth.middleware';

const criarSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  senha: z.string().min(6),
  perfil: z.enum(['ADMINISTRADOR', 'GERENTE', 'CAIXA']).default('CAIXA'),
});

const atualizarSchema = criarSchema.partial().omit({ senha: true });

export async function listar(_req: AuthRequest, res: Response): Promise<void> {
  const usuarios = await prisma.usuario.findMany({
    where: { deletedAt: null },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, createdAt: true },
    orderBy: { nome: 'asc' },
  });
  res.json(usuarios);
}

export async function criar(req: AuthRequest, res: Response): Promise<void> {
  const data = criarSchema.parse(req.body);

  const existe = await prisma.usuario.findFirst({ where: { email: data.email } });
  if (existe) throw new AppError('E-mail já cadastrado', 409);

  const hash = await bcrypt.hash(data.senha, 12);

  const usuario = await prisma.usuario.create({
    data: { ...data, senha: hash },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, createdAt: true },
  });

  res.status(201).json(usuario);
}

export async function buscarPorId(req: AuthRequest, res: Response): Promise<void> {
  const usuario = await prisma.usuario.findFirst({
    where: { id: req.params.id, deletedAt: null },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, createdAt: true },
  });
  if (!usuario) throw new AppError('Usuário não encontrado', 404);
  res.json(usuario);
}

export async function atualizar(req: AuthRequest, res: Response): Promise<void> {
  const data = atualizarSchema.parse(req.body);

  const usuario = await prisma.usuario.update({
    where: { id: req.params.id },
    data,
    select: { id: true, nome: true, email: true, perfil: true, ativo: true },
  });

  res.json(usuario);
}

export async function remover(req: AuthRequest, res: Response): Promise<void> {
  await prisma.usuario.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });
  res.status(204).send();
}
