import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth.middleware';
import { registrarAuditoria } from '../utils/auditoria';

// ── Schemas Zod ───────────────────────────────────────────────────────────────

const itemSchema = z.object({
  produtoId:     z.string().uuid(),
  quantidade:    z.number().min(0.001),
  precoUnitario: z.number().min(0),
});

const pedidoSchema = z.object({
  fornecedorId: z.string().uuid().optional().nullable(),
  observacao:   z.string().optional().nullable(),
  itens:        z.array(itemSchema).min(1, 'O pedido deve ter ao menos um item'),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcularTotal(itens: { quantidade: number; precoUnitario: number }[]) {
  return itens.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0);
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

export async function listar(req: AuthRequest, res: Response): Promise<void> {
  const { page = '1', limit = '20', status, fornecedorId } = req.query as any;
  const skip  = (Number(page) - 1) * Number(limit);
  const where: any = { deletedAt: null };
  if (status)      where.status      = status;
  if (fornecedorId) where.fornecedorId = fornecedorId;

  const [pedidos, total] = await Promise.all([
    (prisma as any).pedidoCompra.findMany({
      where,
      include: {
        fornecedor: { select: { nome: true } },
        _count:     { select: { itens: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
    }),
    (prisma as any).pedidoCompra.count({ where }),
  ]);

  res.json({ data: pedidos, total, page: Number(page), limit: Number(limit) });
}

export async function buscarPorId(req: AuthRequest, res: Response): Promise<void> {
  const pedido = await (prisma as any).pedidoCompra.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: {
      fornecedor: true,
      usuario:    { select: { nome: true } },
      itens:      { include: { produto: { include: { categoria: true } } } },
      notasFiscais: {
        where:  { deletedAt: null },
        select: { id: true, numero: true, serie: true, status: true, valorTotal: true, createdAt: true },
      },
    },
  });
  if (!pedido) throw new AppError('Pedido não encontrado', 404);
  res.json(pedido);
}

export async function criar(req: AuthRequest, res: Response): Promise<void> {
  const data  = pedidoSchema.parse(req.body);
  const total = calcularTotal(data.itens);

  const pedido = await (prisma as any).pedidoCompra.create({
    data: {
      fornecedorId: data.fornecedorId ?? null,
      usuarioId:    req.usuario!.id,
      status:       'RASCUNHO',
      total,
      observacao:   data.observacao ?? null,
      itens: {
        create: data.itens.map((i) => ({
          produtoId:     i.produtoId,
          quantidade:    i.quantidade,
          precoUnitario: i.precoUnitario,
          subtotal:      i.quantidade * i.precoUnitario,
        })),
      },
    },
    include: { fornecedor: true, itens: { include: { produto: true } } },
  });

  await registrarAuditoria({
    usuarioId:  req.usuario!.id,
    acao:       'CRIAR_PEDIDO_COMPRA',
    tabela:     'pedidos_compra',
    registroId: pedido.id,
    dadosDepois: { numero: pedido.numero, total, itens: data.itens.length },
  });

  res.status(201).json(pedido);
}

export async function atualizar(req: AuthRequest, res: Response): Promise<void> {
  const pedido = await (prisma as any).pedidoCompra.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });
  if (!pedido) throw new AppError('Pedido não encontrado', 404);

  const EDITAVEIS = ['RASCUNHO', 'ABERTO'];
  if (!EDITAVEIS.includes(pedido.status)) {
    throw new AppError(`Pedido com status ${pedido.status} não pode ser editado`, 422);
  }

  const data  = pedidoSchema.partial().parse(req.body);
  const total = data.itens ? calcularTotal(data.itens) : undefined;

  // Se novos itens foram enviados, substituir todos
  if (data.itens) {
    await (prisma as any).pedidoCompraItem.deleteMany({ where: { pedidoId: pedido.id } });
  }

  const atualizado = await (prisma as any).pedidoCompra.update({
    where: { id: req.params.id },
    data: {
      ...(data.fornecedorId !== undefined && { fornecedorId: data.fornecedorId }),
      ...(data.observacao   !== undefined && { observacao:   data.observacao }),
      ...(total             !== undefined && { total }),
      ...(data.itens && {
        itens: {
          create: data.itens.map((i) => ({
            produtoId:     i.produtoId,
            quantidade:    i.quantidade,
            precoUnitario: i.precoUnitario,
            subtotal:      i.quantidade * i.precoUnitario,
          })),
        },
      }),
    },
    include: { fornecedor: true, itens: { include: { produto: true } } },
  });

  await registrarAuditoria({
    usuarioId:  req.usuario!.id,
    acao:       'ATUALIZAR_PEDIDO_COMPRA',
    tabela:     'pedidos_compra',
    registroId: pedido.id,
  });

  res.json(atualizado);
}

export async function abrir(req: AuthRequest, res: Response): Promise<void> {
  const pedido = await (prisma as any).pedidoCompra.findFirst({
    where: { id: req.params.id, status: 'RASCUNHO', deletedAt: null },
  });
  if (!pedido) throw new AppError('Pedido não encontrado ou não está em rascunho', 404);

  const atualizado = await (prisma as any).pedidoCompra.update({
    where: { id: req.params.id },
    data:  { status: 'ABERTO' },
  });
  res.json(atualizado);
}

export async function enviar(req: AuthRequest, res: Response): Promise<void> {
  const pedido = await (prisma as any).pedidoCompra.findFirst({
    where: { id: req.params.id, status: 'ABERTO', deletedAt: null },
  });
  if (!pedido) throw new AppError('Pedido não encontrado ou não está aberto', 404);

  const atualizado = await (prisma as any).pedidoCompra.update({
    where: { id: req.params.id },
    data:  { status: 'ENVIADO' },
  });
  res.json(atualizado);
}

export async function cancelar(req: AuthRequest, res: Response): Promise<void> {
  const pedido = await (prisma as any).pedidoCompra.findFirst({
    where: { id: req.params.id, deletedAt: null },
  });
  if (!pedido) throw new AppError('Pedido não encontrado', 404);

  const BLOQUEADOS = ['RECEBIDO', 'CONCLUIDO'];
  if (BLOQUEADOS.includes(pedido.status)) {
    throw new AppError(`Pedido ${pedido.status} não pode ser cancelado`, 422);
  }

  await (prisma as any).pedidoCompra.update({
    where: { id: req.params.id },
    data:  { status: 'CANCELADO', deletedAt: new Date() },
  });

  await registrarAuditoria({
    usuarioId:  req.usuario!.id,
    acao:       'CANCELAR_PEDIDO_COMPRA',
    tabela:     'pedidos_compra',
    registroId: pedido.id,
    dadosAntes: { status: pedido.status },
  });

  res.json({ mensagem: 'Pedido cancelado' });
}

export async function dashboard(_req: AuthRequest, res: Response): Promise<void> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [abertos, aguardandoConferencia, divergencias, recebidosHoje, faturados] =
    await Promise.all([
      (prisma as any).pedidoCompra.count({ where: { status: { in: ['ABERTO', 'ENVIADO'] }, deletedAt: null } }),
      (prisma as any).notaFiscalEntrada.count({ where: { status: { in: ['IMPORTADA', 'AGUARDANDO_VINCULO', 'EM_CONFERENCIA'] }, deletedAt: null } }),
      (prisma as any).divergencia.count({ where: { status: 'PENDENTE' } }),
      (prisma as any).recebimento.count({ where: { status: 'CONCLUIDO', dataRecebimento: { gte: hoje } } }),
      (prisma as any).pedidoCompra.count({ where: { status: 'FATURADO', deletedAt: null } }),
    ]);

  res.json({ abertos, aguardandoConferencia, divergencias, recebidosHoje, faturados });
}
