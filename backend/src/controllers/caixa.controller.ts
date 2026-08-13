import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth.middleware';
import { registrarAuditoria } from '../utils/auditoria';

export async function abrirCaixa(req: AuthRequest, res: Response): Promise<void> {
  const schema = z.object({ valorAbertura: z.number().min(0) });
  const { valorAbertura } = schema.parse(req.body);

  const caixaAberto = await prisma.caixa.findFirst({
    where: { usuarioId: req.usuario!.id, status: 'ABERTO' },
  });
  if (caixaAberto) throw new AppError('Já existe um caixa aberto para este operador', 409);

  const caixa = await prisma.caixa.create({
    data: {
      usuarioId: req.usuario!.id,
      valorAbertura,
      status: 'ABERTO',
    },
  });

  await prisma.movimentoCaixa.create({
    data: {
      caixaId: caixa.id,
      usuarioId: req.usuario!.id,
      tipo: 'ABERTURA',
      valor: valorAbertura,
      descricao: 'Abertura de caixa',
    },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    acao: 'ABERTURA_CAIXA',
    tabela: 'caixas',
    registroId: caixa.id,
  });

  res.status(201).json(caixa);
}

export async function fecharCaixa(req: AuthRequest, res: Response): Promise<void> {
  const schema = z.object({
    caixaId: z.string().uuid(),
    valorContado: z.number().min(0),
    observacoes: z.string().optional(),
  });
  const { caixaId, valorContado, observacoes } = schema.parse(req.body);

  const caixa = await prisma.caixa.findFirst({
    where: { id: caixaId, status: 'ABERTO' },
    include: { movimentos: true },
  });
  if (!caixa) throw new AppError('Caixa não encontrado ou já fechado', 404);

  // Impedir fechamento se houver vendas em andamento (PRD Seção 21)
  const vendaAberta = await prisma.venda.findFirst({
    where: { caixaId, status: 'ABERTA', deletedAt: null },
  });
  if (vendaAberta) {
    throw new AppError(
      'Existem vendas em andamento neste caixa. Finalize ou cancele as vendas antes de fechar o caixa.',
      409
    );
  }

  // Calcular valor esperado
  const totalEntradas = caixa.movimentos
    .filter((m) => ['ABERTURA', 'SUPRIMENTO', 'VENDA'].includes(m.tipo))
    .reduce((acc, m) => acc + Number(m.valor), 0);
  const totalSaidas = caixa.movimentos
    .filter((m) => ['SANGRIA', 'DEVOLUCAO'].includes(m.tipo))
    .reduce((acc, m) => acc + Number(m.valor), 0);

  const valorEsperado = totalEntradas - totalSaidas;
  const diferenca = valorContado - valorEsperado;

  const caixaFechado = await prisma.caixa.update({
    where: { id: caixaId },
    data: {
      status: 'FECHADO',
      valorEsperado,
      valorContado,
      diferenca,
      observacoes,
      fechamentoEm: new Date(),
    },
  });

  await prisma.movimentoCaixa.create({
    data: {
      caixaId,
      usuarioId: req.usuario!.id,
      tipo: 'FECHAMENTO',
      valor: valorContado,
      descricao: `Fechamento - Esperado: ${valorEsperado.toFixed(2)} Diferença: ${diferenca.toFixed(2)}`,
    },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    acao: 'FECHAMENTO_CAIXA',
    tabela: 'caixas',
    registroId: caixaId,
  });

  res.json(caixaFechado);
}

export async function sangria(req: AuthRequest, res: Response): Promise<void> {
  const schema = z.object({
    caixaId: z.string().uuid(),
    valor: z.number().min(0.01),
    descricao: z.string().optional(),
  });
  const { caixaId, valor, descricao } = schema.parse(req.body);

  const caixa = await prisma.caixa.findFirst({ where: { id: caixaId, status: 'ABERTO' } });
  if (!caixa) throw new AppError('Caixa não encontrado ou fechado', 404);

  const mov = await prisma.movimentoCaixa.create({
    data: {
      caixaId,
      usuarioId: req.usuario!.id,
      tipo: 'SANGRIA',
      valor,
      descricao: descricao || 'Sangria de caixa',
    },
  });

  res.status(201).json(mov);
}

export async function suprimento(req: AuthRequest, res: Response): Promise<void> {
  const schema = z.object({
    caixaId: z.string().uuid(),
    valor: z.number().min(0.01),
    descricao: z.string().optional(),
  });
  const { caixaId, valor, descricao } = schema.parse(req.body);

  const caixa = await prisma.caixa.findFirst({ where: { id: caixaId, status: 'ABERTO' } });
  if (!caixa) throw new AppError('Caixa não encontrado ou fechado', 404);

  const mov = await prisma.movimentoCaixa.create({
    data: {
      caixaId,
      usuarioId: req.usuario!.id,
      tipo: 'SUPRIMENTO',
      valor,
      descricao: descricao || 'Suprimento de caixa',
    },
  });

  res.status(201).json(mov);
}

export async function caixaAtual(req: AuthRequest, res: Response): Promise<void> {
  const caixa = await prisma.caixa.findFirst({
    where: { usuarioId: req.usuario!.id, status: 'ABERTO' },
    include: {
      movimentos: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  res.json(caixa || null);
}

export async function historico(req: AuthRequest, res: Response): Promise<void> {
  const { page = '1', limit = '20' } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);

  const [caixas, total] = await Promise.all([
    prisma.caixa.findMany({
      orderBy: { aberturaEm: 'desc' },
      include: { usuario: { select: { nome: true } } },
      skip,
      take: Number(limit),
    }),
    prisma.caixa.count(),
  ]);

  res.json({ data: caixas, total, page: Number(page), limit: Number(limit) });
}
