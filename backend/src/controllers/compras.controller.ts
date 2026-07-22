import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middlewares/auth.middleware';
import { registrarAuditoria } from '../utils/auditoria';

const itemSchema = z.object({
  produtoId: z.string().uuid(),
  quantidade: z.number().min(0.001),
  precoUnit: z.number().min(0),
});

const compraSchema = z.object({
  fornecedorId: z.string().uuid().optional(),
  desconto: z.number().min(0).default(0),
  observacoes: z.string().optional(),
  notaFiscal: z.string().optional(),
  itens: z.array(itemSchema).min(1),
});

export async function criar(req: AuthRequest, res: Response): Promise<void> {
  const data = compraSchema.parse(req.body);

  const subtotal = data.itens.reduce((acc, i) => acc + i.precoUnit * i.quantidade, 0);
  const total = subtotal - data.desconto;

  const compra = await prisma.compra.create({
    data: {
      fornecedorId: data.fornecedorId,
      subtotal,
      desconto: data.desconto,
      total,
      observacoes: data.observacoes,
      notaFiscal: data.notaFiscal,
      status: 'RASCUNHO',
      itens: {
        create: data.itens.map((item) => ({
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          precoUnit: item.precoUnit,
          subtotal: item.precoUnit * item.quantidade,
        })),
      },
    },
    include: { itens: { include: { produto: true } }, fornecedor: true },
  });

  res.status(201).json(compra);
}

export async function concluir(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const compra = await prisma.compra.findFirst({
    where: { id, status: 'RASCUNHO' },
    include: { itens: true },
  });
  if (!compra) throw new AppError('Compra não encontrada ou já processada', 404);

  await prisma.$transaction(async (tx) => {
    await tx.compra.update({ where: { id }, data: { status: 'CONCLUIDA' } });

    for (const item of compra.itens) {
      const produto = await tx.produto.findUnique({ where: { id: item.produtoId } });
      if (!produto) continue;

      const saldoAntes = produto.estoqueAtual;
      const saldoDepois = saldoAntes + item.quantidade;

      // Calcular preço médio ponderado
      const totalAtual = produto.estoqueAtual * Number(produto.precoCompra);
      const totalNovo = item.quantidade * Number(item.precoUnit);
      const novoPrecoMedio =
        saldoDepois > 0 ? (totalAtual + totalNovo) / saldoDepois : Number(item.precoUnit);

      await tx.produto.update({
        where: { id: item.produtoId },
        data: {
          estoqueAtual: saldoDepois,
          precoCompra: novoPrecoMedio,
          fornecedorId: compra.fornecedorId,
        },
      });

      await tx.movimentoEstoque.create({
        data: {
          produtoId: item.produtoId,
          tipo: 'ENTRADA_COMPRA',
          quantidade: item.quantidade,
          saldoAntes,
          saldoDepois,
          referencia: id,
          motivo: `Compra #${compra.numero}`,
        },
      });
    }
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    acao: 'CONCLUIR_COMPRA',
    tabela: 'compras',
    registroId: id,
  });

  const compraAtualizada = await prisma.compra.findUnique({
    where: { id },
    include: { itens: { include: { produto: true } }, fornecedor: true },
  });

  res.json(compraAtualizada);
}

export async function listar(req: AuthRequest, res: Response): Promise<void> {
  const { page = '1', limit = '20', status } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);
  const where: any = { deletedAt: null };
  if (status) where.status = status;

  const [compras, total] = await Promise.all([
    prisma.compra.findMany({
      where,
      include: { fornecedor: { select: { nome: true } }, _count: { select: { itens: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
    }),
    prisma.compra.count({ where }),
  ]);

  res.json({ data: compras, total, page: Number(page), limit: Number(limit) });
}

export async function buscarPorId(req: AuthRequest, res: Response): Promise<void> {
  const compra = await prisma.compra.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: {
      fornecedor: true,
      itens: { include: { produto: { include: { categoria: true } } } },
    },
  });
  if (!compra) throw new AppError('Compra não encontrada', 404);
  res.json(compra);
}

export async function cancelar(req: AuthRequest, res: Response): Promise<void> {
  const compra = await prisma.compra.findFirst({
    where: { id: req.params.id, status: 'RASCUNHO' },
  });
  if (!compra) throw new AppError('Compra não encontrada ou não pode ser cancelada', 404);

  await prisma.compra.update({
    where: { id: req.params.id },
    data: { status: 'CANCELADA', deletedAt: new Date() },
  });

  res.json({ mensagem: 'Compra cancelada' });
}
