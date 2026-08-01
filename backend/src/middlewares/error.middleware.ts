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
  console.error(`[Erro API] ${req.method} ${req.url}:`, err);

  // Erros de validação do Zod
  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    logger.warn(`[ZodError 422] ${req.method} ${req.url}:`, messages);
    res.status(422).json({ erro: 'Dados inválidos', detalhes: messages });
    return;
  }

  // Erros de negócio / operacionais
  const statusCode = (err as any).statusCode || (err instanceof AppError ? err.statusCode : null);
  if (statusCode || (err as any).isOperational || err instanceof AppError) {
    const status = statusCode || 400;
    res.status(status).json({ erro: err.message });
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

  // Erros não tratados (desconhecidos)
  logger.error('Erro não tratado:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  res.status(500).json({ erro: err.message || 'Erro interno do servidor' });
}
