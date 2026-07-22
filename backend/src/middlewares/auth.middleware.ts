import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

interface JwtPayload {
  sub: string;
  perfil: string;
  iat: number;
  exp: number;
}

export interface AuthRequest<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  usuario?: { id: string; perfil: string };
  params: P;
  query: ReqQuery;
  body: ReqBody;
}

export function autenticar(req: AuthRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Token de autenticação não fornecido', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.usuario = { id: decoded.sub, perfil: decoded.perfil };
    next();
  } catch {
    throw new AppError('Token inválido ou expirado', 401);
  }
}

export function autorizar(...perfis: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.usuario) {
      throw new AppError('Não autenticado', 401);
    }
    if (perfis.length > 0 && !perfis.includes(req.usuario.perfil)) {
      throw new AppError('Sem permissão para acessar este recurso', 403);
    }
    next();
  };
}
