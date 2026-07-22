import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Erros de validação do Zod
  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    logger.warn(`[ZodError 422] ${req.method} ${req.url}:`, messages);
    res.status(422).json({ erro: 'Dados inválidos', detalhes: messages });
    return;
  }

  // Erros de negócio
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ erro: err.message });
    return;
  }

  // Erros do Prisma
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;
    if (prismaErr.code === 'P2002') {
      res.status(409).json({ erro: 'Registro duplicado', campo: prismaErr.meta?.target });
      return;
    }
    if (prismaErr.code === 'P2025') {
      res.status(404).json({ erro: 'Registro não encontrado' });
      return;
    }
  }

  // Erros desconhecidos
  logger.error('Erro não tratado:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  res.status(500).json({ erro: 'Erro interno do servidor' });
}
