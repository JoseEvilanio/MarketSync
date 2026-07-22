import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { registrarAuditoria } from '../utils/auditoria';
import { AuthRequest } from '../middlewares/auth.middleware';
import { logEvent } from '../utils/logger';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  senha: z.string().min(1, 'Senha obrigatória'),
});

export async function login(req: Request, res: Response): Promise<void> {
  const { email, senha } = loginSchema.parse(req.body);

  const usuario = await prisma.usuario.findFirst({
    where: { email, deletedAt: null },
  });

  if (!usuario) {
    logEvent({ nivel: 'warn', modulo: 'auth', mensagem: `Tentativa de login com e-mail inexistente: ${email}`, dados: { ip: req.ip } });
    throw new AppError('Credenciais inválidas', 401);
  }
  if (!usuario.ativo) {
    logEvent({ nivel: 'warn', modulo: 'auth', mensagem: `Login bloqueado — usuário inativo: ${email}`, dados: { ip: req.ip } });
    throw new AppError('Usuário inativo', 401);
  }

  const senhaValida = await bcrypt.compare(senha, usuario.senha);
  if (!senhaValida) {
    logEvent({ nivel: 'warn', modulo: 'auth', mensagem: `Senha incorreta para: ${email}`, dados: { ip: req.ip } });
    throw new AppError('Credenciais inválidas', 401);
  }

  const token = jwt.sign(
    { sub: usuario.id, perfil: usuario.perfil },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
  );

  await registrarAuditoria({
    usuarioId: usuario.id,
    acao: 'LOGIN',
    ip: req.ip,
  });

  logEvent({
    nivel: 'info',
    modulo: 'auth',
    mensagem: `Login bem-sucedido: ${usuario.email}`,
    usuario: usuario.email,
    dados: { perfil: usuario.perfil, ip: req.ip },
  });

  res.json({
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
    },
  });
}

export async function perfil(req: AuthRequest, res: Response): Promise<void> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.usuario!.id },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, createdAt: true },
  });

  if (!usuario) throw new AppError('Usuário não encontrado', 404);

  res.json(usuario);
}

export async function alterarSenha(req: AuthRequest, res: Response): Promise<void> {
  const schema = z.object({
    senhaAtual: z.string().min(1),
    novaSenha: z.string().min(6, 'Nova senha deve ter pelo menos 6 caracteres'),
  });

  const { senhaAtual, novaSenha } = schema.parse(req.body);

  const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario!.id } });
  if (!usuario) throw new AppError('Usuário não encontrado', 404);

  const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha);
  if (!senhaValida) throw new AppError('Senha atual incorreta', 401);

  const hash = await bcrypt.hash(novaSenha, 12);

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senha: hash },
  });

  res.json({ mensagem: 'Senha alterada com sucesso' });
}
