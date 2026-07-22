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
  desconto: z.number().min(0).default(0),
});

const pagamentoSchema = z.object({
  formaPagamento: z.enum(['DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'VALE', 'FIADO']),
  valor: z.number().min(0),
});

const vendaSchema = z.object({
  clienteId: z.string().uuid().optional(),
  caixaId: z.string().uuid().optional(),
  desconto: z.number().min(0).default(0),
  itens: z.array(itemSchema).min(1, 'A venda deve ter pelo menos 1 item'),
  pagamentos: z.array(pagamentoSchema).min(1, 'Informe pelo menos uma forma de pagamento'),
  observacoes: z.string().optional(),
});

export async function registrar(req: AuthRequest, res: Response): Promise<void> {
  const data = vendaSchema.parse(req.body);

  // Verificar estoque de todos os itens antes de registrar
  for (const item of data.itens) {
    const produto = await prisma.produto.findFirst({
      where: { id: item.produtoId, deletedAt: null, ativo: true },
    });
    if (!produto) throw new AppError(`Produto ${item.produtoId} não encontrado`, 404);
    if (produto.estoqueAtual < item.quantidade) {
      throw new AppError(`Estoque insuficiente para: ${produto.nome}`, 422);
    }
  }

  // Calcular totais
  const subtotal = data.itens.reduce(
    (acc, item) => acc + item.precoUnit * item.quantidade - item.desconto,
    0
  );
  const total = subtotal - data.desconto;

  const totalPago = data.pagamentos.reduce((acc, p) => acc + p.valor, 0);
  if (totalPago < total) throw new AppError('Valor pago insuficiente', 422);

  const troco = data.pagamentos.some((p) => p.formaPagamento === 'DINHEIRO')
    ? Math.max(0, totalPago - total)
    : 0;

  const formaPrincipal =
    data.pagamentos.length === 1 ? data.pagamentos[0].formaPagamento : 'MISTO';

  // Criar venda em transação
  const venda = await prisma.$transaction(async (tx) => {
    const novaVenda = await tx.venda.create({
      data: {
        usuarioId: req.usuario!.id,
        clienteId: data.clienteId,
        caixaId: data.caixaId,
        subtotal,
        desconto: data.desconto,
        total,
        formaPagamento: formaPrincipal as any,
        valorPago: totalPago,
        troco,
        observacoes: data.observacoes,
        status: 'CONCLUIDA',
        itens: {
          create: data.itens.map((item) => ({
            produtoId: item.produtoId,
            quantidade: item.quantidade,
            precoUnit: item.precoUnit,
            desconto: item.desconto,
            subtotal: item.precoUnit * item.quantidade - item.desconto,
          })),
        },
        pagamentos: {
          create: data.pagamentos.map((p) => ({
            formaPagamento: p.formaPagamento,
            valor: p.valor,
          })),
        },
      },
      include: { itens: { include: { produto: true } }, pagamentos: true },
    });

    // Baixar estoque e registrar movimentos
    for (const item of data.itens) {
      const produto = await tx.produto.findUnique({ where: { id: item.produtoId } });
      if (!produto) continue;

      const novoEstoque = produto.estoqueAtual - item.quantidade;

      await tx.produto.update({
        where: { id: item.produtoId },
        data: { estoqueAtual: novoEstoque },
      });

      await tx.movimentoEstoque.create({
        data: {
          produtoId: item.produtoId,
          tipo: 'SAIDA_VENDA',
          quantidade: item.quantidade,
          saldoAntes: produto.estoqueAtual,
          saldoDepois: novoEstoque,
          referencia: novaVenda.id,
          motivo: `Venda #${novaVenda.numero}`,
        },
      });
    }

    // Registrar no caixa
    if (data.caixaId) {
      await tx.movimentoCaixa.create({
        data: {
          caixaId: data.caixaId,
          usuarioId: req.usuario!.id,
          tipo: 'VENDA',
          valor: total,
          descricao: `Venda #${novaVenda.numero}`,
        },
      });
    }

    return novaVenda;
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    acao: 'REGISTRAR_VENDA',
    tabela: 'vendas',
    registroId: venda.id,
  });

  res.status(201).json(venda);
}

export async function cancelar(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const schema = z.object({ motivo: z.string().min(5) });
  const { motivo } = schema.parse(req.body);

  const venda = await prisma.venda.findFirst({
    where: { id, deletedAt: null },
    include: { itens: true },
  });
  if (!venda) throw new AppError('Venda não encontrada', 404);
  if (venda.status === 'CANCELADA') throw new AppError('Venda já cancelada', 409);

  await prisma.$transaction(async (tx) => {
    await tx.venda.update({
      where: { id },
      data: { status: 'CANCELADA', deletedAt: new Date() },
    });

    // Estornar estoque
    for (const item of venda.itens) {
      const produto = await tx.produto.findUnique({ where: { id: item.produtoId } });
      if (!produto) continue;

      const novoEstoque = produto.estoqueAtual + item.quantidade;

      await tx.produto.update({
        where: { id: item.produtoId },
        data: { estoqueAtual: novoEstoque },
      });

      await tx.movimentoEstoque.create({
        data: {
          produtoId: item.produtoId,
          tipo: 'ENTRADA_DEVOLUCAO',
          quantidade: item.quantidade,
          saldoAntes: produto.estoqueAtual,
          saldoDepois: novoEstoque,
          referencia: id,
          motivo: `Cancelamento venda #${venda.numero}: ${motivo}`,
        },
      });
    }
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    acao: 'CANCELAR_VENDA',
    tabela: 'vendas',
    registroId: id,
    dadosDepois: { motivo },
  });

  res.json({ mensagem: 'Venda cancelada com sucesso' });
}

export async function listar(req: AuthRequest, res: Response): Promise<void> {
  const { page = '1', limit = '20', dataInicio, dataFim, status } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = { deletedAt: null };
  if (status) where.status = status;
  if (dataInicio || dataFim) {
    where.createdAt = {};
    if (dataInicio) where.createdAt.gte = new Date(dataInicio);
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      where.createdAt.lte = fim;
    }
  }

  const [vendas, total] = await Promise.all([
    prisma.venda.findMany({
      where,
      include: {
        usuario: { select: { nome: true } },
        cliente: { select: { nome: true } },
        itens: { include: { produto: { select: { nome: true } } } },
        pagamentos: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
    }),
    prisma.venda.count({ where }),
  ]);

  res.json({ data: vendas, total, page: Number(page), limit: Number(limit) });
}

export async function buscarPorId(req: AuthRequest, res: Response): Promise<void> {
  const venda = await prisma.venda.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: {
      usuario: { select: { nome: true } },
      cliente: true,
      itens: { include: { produto: true } },
      pagamentos: true,
    },
  });
  if (!venda) throw new AppError('Venda não encontrada', 404);
  res.json(venda);
}
