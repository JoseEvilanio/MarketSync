import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth.middleware';

export async function listar(_req: AuthRequest, res: Response): Promise<void> {
  const configs = await prisma.configuracao.findMany({ orderBy: { chave: 'asc' } });
  // Retornar como objeto chave→valor
  const obj = Object.fromEntries(configs.map((c) => [c.chave, c.valor]));
  res.json(obj);
}

export async function atualizar(req: AuthRequest, res: Response): Promise<void> {
  // Recebe { chave: valor, chave2: valor2 }
  const schema = z.record(z.string());
  const data = schema.parse(req.body);

  const updates = await Promise.all(
    Object.entries(data).map(([chave, valor]) =>
      prisma.configuracao.upsert({
        where: { chave },
        update: { valor },
        create: { chave, valor },
      })
    )
  );

  res.json({ mensagem: `${updates.length} configuração(ões) salva(s)` });
}
