import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth.middleware';
import { registrarAuditoria } from '../utils/auditoria';

// ── Endpoints ─────────────────────────────────────────────────────────────────

export async function listar(req: AuthRequest, res: Response): Promise<void> {
  const { page = '1', limit = '20', fornecedorId, dataInicio, dataFim } = req.query as any;
  const skip  = (Number(page) - 1) * Number(limit);
  const where: any = { status: 'CONCLUIDO' };

  if (dataInicio || dataFim) {
    where.dataRecebimento = {};
    if (dataInicio) where.dataRecebimento.gte = new Date(dataInicio);
    if (dataFim)    where.dataRecebimento.lte = new Date(dataFim + 'T23:59:59');
  }

  // Filtro por fornecedor via NF-e
  if (fornecedorId) {
    where.notaFiscal = { fornecedorId };
  }

  const [recebimentos, total] = await Promise.all([
    (prisma as any).recebimento.findMany({
      where,
      include: {
        usuario:    { select: { nome: true } },
        notaFiscal: {
          select: {
            numero:     true,
            serie:      true,
            valorTotal: true,
            fornecedor: { select: { nome: true } },
          },
        },
        _count: { select: { itens: true } },
      },
      orderBy: { dataRecebimento: 'desc' },
      skip,
      take: Number(limit),
    }),
    (prisma as any).recebimento.count({ where }),
  ]);

  res.json({ data: recebimentos, total, page: Number(page), limit: Number(limit) });
}

export async function buscarPorId(req: AuthRequest, res: Response): Promise<void> {
  const recebimento = await (prisma as any).recebimento.findUnique({
    where:   { id: req.params.id },
    include: {
      usuario:    { select: { nome: true } },
      notaFiscal: {
        include: { fornecedor: true },
      },
      itens: {
        include: {
          produto: { select: { id: true, nome: true, codigoBarras: true, unidade: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!recebimento) throw new AppError('Recebimento não encontrado', 404);
  res.json(recebimento);
}

export async function listarDivergencias(req: AuthRequest, res: Response): Promise<void> {
  const { page = '1', limit = '20', status = 'PENDENTE', fornecedorId } = req.query as any;
  const skip  = (Number(page) - 1) * Number(limit);
  const where: any = {};
  if (status) where.status = status;
  if (fornecedorId) {
    where.notaFiscal = { fornecedorId };
  }

  const [divergencias, total] = await Promise.all([
    (prisma as any).divergencia.findMany({
      where,
      include: {
        notaFiscal: { select: { numero: true, serie: true, fornecedor: { select: { nome: true } } } },
        produto:    { select: { nome: true } },
        resolvidoPor: { select: { nome: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
    }),
    (prisma as any).divergencia.count({ where }),
  ]);

  res.json({ data: divergencias, total, page: Number(page), limit: Number(limit) });
}

export async function resolverDivergencia(req: AuthRequest, res: Response): Promise<void> {
  const schema = z.object({
    quantidadeAceita: z.number().min(0).optional(),
    observacao:       z.string().min(1, 'Observação obrigatória ao resolver divergência'),
    ignorar:          z.boolean().default(false),
  });
  const data = schema.parse(req.body);

  const divergencia = await (prisma as any).divergencia.findUnique({
    where: { id: req.params.id },
  });
  if (!divergencia) throw new AppError('Divergência não encontrada', 404);
  if (divergencia.status !== 'PENDENTE') {
    throw new AppError('Divergência já foi resolvida', 409);
  }

  const novoStatus = data.ignorar ? 'IGNORADA' : 'RESOLVIDA';

  const atualizada = await (prisma as any).divergencia.update({
    where: { id: req.params.id },
    data: {
      status:           novoStatus,
      quantidadeAceita: data.quantidadeAceita ?? divergencia.quantidadeNfe,
      resolvidoPorId:   req.usuario!.id,
      resolvidoEm:      new Date(),
      observacao:       data.observacao,
    },
  });

  await registrarAuditoria({
    usuarioId:  req.usuario!.id,
    acao:       'RESOLVER_DIVERGENCIA',
    tabela:     'divergencias',
    registroId: divergencia.id,
    dadosAntes:  { status: 'PENDENTE' },
    dadosDepois: { status: novoStatus, quantidadeAceita: data.quantidadeAceita, observacao: data.observacao },
  });

  res.json(atualizada);
}
