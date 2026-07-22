import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../middlewares/auth.middleware';

export async function listar(_req: AuthRequest, res: Response): Promise<void> {
  const marcas = await prisma.marca.findMany({
    where: { ativo: true },
    orderBy: { nome: 'asc' },
  });
  res.json(marcas);
}

export async function criar(req: AuthRequest, res: Response): Promise<void> {
  const schema = z.object({ nome: z.string().min(2) });
  const { nome } = schema.parse(req.body);
  const marca = await prisma.marca.upsert({
    where: { nome },
    update: { ativo: true },
    create: { nome },
  });
  res.status(201).json(marca);
}
