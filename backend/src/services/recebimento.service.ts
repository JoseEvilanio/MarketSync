import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { registrarAuditoria } from '../utils/auditoria';

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface ItemReceber {
  notaFiscalItemId: string;
  produtoId: string;
  quantidade: number;
  valorUnitario: number;
}

export interface ConfirmarRecebimentoParams {
  notaFiscalId:  string;
  usuarioId:     string;
  itens:         ItemReceber[];
  observacao?:   string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Calcula o preço médio ponderado entre estoque atual e novo lote. */
function calcularPrecoMedio(
  estoqueAtual:   number,
  precoAtual:     number,
  qtdNova:        number,
  precoNovo:      number
): number {
  const totalQtd = estoqueAtual + qtdNova;
  if (totalQtd <= 0) return precoNovo;
  return (estoqueAtual * precoAtual + qtdNova * precoNovo) / totalQtd;
}

// ── Serviço principal ─────────────────────────────────────────────────────────

/**
 * Confirma o recebimento de uma NF-e em uma transação atômica:
 * 1. Cria Recebimento + RecebimentoItens
 * 2. Movimenta estoque (ENTRADA_NFE) por produto
 * 3. Atualiza estoqueAtual e precoCompra (preço médio ponderado)
 * 4. Marca NF-e como RECEBIDA
 * 5. Atualiza quantidadeRecebida nos PedidoCompraItens vinculados
 * 6. Atualiza status do(s) pedido(s) vinculado(s)
 * 7. Registra auditoria
 *
 * ROLLBACK automático em qualquer falha.
 */
export async function confirmarRecebimento(
  params: ConfirmarRecebimentoParams
) {
  const { notaFiscalId, usuarioId, itens, observacao } = params;

  if (itens.length === 0) {
    throw new AppError('Nenhum item informado para recebimento', 400);
  }

  // Guard de idempotência — fora da transação para dar erro antes de abri-la
  const nf = await (prisma as any).notaFiscalEntrada.findUnique({
    where: { id: notaFiscalId },
    include: { pedidos: { include: { itens: true } } },
  });
  if (!nf) throw new AppError('Nota Fiscal não encontrada', 404);
  if (nf.status === 'RECEBIDA') {
    throw new AppError('Esta NF-e já foi recebida. Operação bloqueada para evitar duplicidade.', 409);
  }

  // ── Transação atômica ─────────────────────────────────────────────────────
  const recebimento = await prisma.$transaction(async (tx: any) => {
    // 1. Criar Recebimento
    const rec = await tx.recebimento.create({
      data: {
        notaFiscalId,
        usuarioId,
        status:         'CONCLUIDO',
        dataRecebimento: new Date(),
        observacao,
      },
    });

    // 2. Processar cada item
    for (const item of itens) {
      // Buscar produto com lock implícito via update
      const produto = await tx.produto.findUnique({
        where: { id: item.produtoId },
        select: { id: true, nome: true, estoqueAtual: true, precoCompra: true },
      });
      if (!produto) {
        throw new AppError(`Produto ${item.produtoId} não encontrado`, 404);
      }

      const saldoAntes   = produto.estoqueAtual;
      const saldoDepois  = saldoAntes + item.quantidade;
      const novoPreco    = calcularPrecoMedio(
        saldoAntes,
        Number(produto.precoCompra),
        item.quantidade,
        item.valorUnitario
      );

      // 2a. RecebimentoItem
      await tx.recebimentoItem.create({
        data: {
          recebimentoId: rec.id,
          produtoId:     item.produtoId,
          quantidade:    item.quantidade,
          valorUnitario: item.valorUnitario,
          subtotal:      item.quantidade * item.valorUnitario,
        },
      });

      // 2b. MovimentoEstoque ENTRADA_NFE
      await tx.movimentoEstoque.create({
        data: {
          produtoId:  item.produtoId,
          tipo:       'ENTRADA_NFE',
          quantidade: item.quantidade,
          saldoAntes,
          saldoDepois,
          referencia: notaFiscalId,
          motivo:     `Recebimento NF-e #${nf.numero} — ${nf.serie}`,
        },
      });

      // 2c. Atualizar estoque e preço médio
      await tx.produto.update({
        where: { id: item.produtoId },
        data: {
          estoqueAtual: saldoDepois,
          precoCompra:  novoPreco,
          // Atualiza fornecedor principal do produto se NF-e tem fornecedor
          ...(nf.fornecedorId ? { fornecedorId: nf.fornecedorId } : {}),
        },
      });

      // 2d. Atualizar quantidadeRecebida no(s) PedidoCompraItem vinculado(s)
      for (const pedido of nf.pedidos) {
        const pedidoItem = pedido.itens.find(
          (pi: any) => pi.produtoId === item.produtoId
        );
        if (pedidoItem) {
          await tx.pedidoCompraItem.update({
            where: { id: pedidoItem.id },
            data:  { quantidadeRecebida: { increment: item.quantidade } },
          });
        }
      }
    }

    // 3. Marcar NF-e como RECEBIDA
    await tx.notaFiscalEntrada.update({
      where: { id: notaFiscalId },
      data:  { status: 'RECEBIDA' },
    });

    // 4. Atualizar status dos pedidos vinculados
    for (const pedido of nf.pedidos) {
      // Recarregar itens atualizados dentro da transação
      const pedidoAtualizado = await tx.pedidoCompra.findUnique({
        where:   { id: pedido.id },
        include: { itens: true },
      });
      if (!pedidoAtualizado) continue;

      const todosConcluidos = pedidoAtualizado.itens.every(
        (pi: any) => pi.quantidadeRecebida >= pi.quantidade
      );
      const algumRecebido = pedidoAtualizado.itens.some(
        (pi: any) => pi.quantidadeRecebida > 0
      );

      const novoStatus = todosConcluidos
        ? 'RECEBIDO'
        : algumRecebido
        ? 'PARCIAL'
        : pedidoAtualizado.status;

      if (novoStatus !== pedidoAtualizado.status) {
        await tx.pedidoCompra.update({
          where: { id: pedido.id },
          data:  { status: novoStatus },
        });
      }
    }

    return rec;
  });

  // 5. Auditoria fora da transação
  await registrarAuditoria({
    usuarioId,
    acao:       'CONFIRMAR_RECEBIMENTO',
    tabela:     'recebimentos',
    registroId: recebimento.id,
    dadosDepois: {
      notaFiscalId,
      totalItens: itens.length,
      observacao,
    },
  });

  return recebimento;
}

// ── Estorno ───────────────────────────────────────────────────────────────────

/**
 * Estorna um recebimento já confirmado (apenas ADMINISTRADOR).
 * Gera movimentos SAIDA_ESTORNO_NFE e reverte estoqueAtual.
 * Preserva todo o histórico original — nunca deleta registros.
 */
export async function estornarRecebimento(
  recebimentoId: string,
  usuarioId: string
) {
  const recebimento = await (prisma as any).recebimento.findUnique({
    where:   { id: recebimentoId },
    include: {
      itens:     { include: { produto: true } },
      notaFiscal: true,
    },
  });
  if (!recebimento) throw new AppError('Recebimento não encontrado', 404);
  if (recebimento.status === 'CANCELADO') {
    throw new AppError('Recebimento já foi estornado', 409);
  }

  await prisma.$transaction(async (tx: any) => {
    // Reverter estoque de cada item
    for (const item of recebimento.itens) {
      const produto = await tx.produto.findUnique({
        where:  { id: item.produtoId },
        select: { estoqueAtual: true, precoCompra: true },
      });
      if (!produto) continue;

      const saldoAntes  = produto.estoqueAtual;
      const saldoDepois = Math.max(0, saldoAntes - item.quantidade);

      await tx.movimentoEstoque.create({
        data: {
          produtoId:  item.produtoId,
          tipo:       'SAIDA_ESTORNO_NFE',
          quantidade: item.quantidade,
          saldoAntes,
          saldoDepois,
          referencia: recebimento.notaFiscalId,
          motivo:     `Estorno recebimento NF-e #${recebimento.notaFiscal.numero}`,
        },
      });

      await tx.produto.update({
        where: { id: item.produtoId },
        data:  { estoqueAtual: saldoDepois },
      });
    }

    // Marcar recebimento como cancelado
    await tx.recebimento.update({
      where: { id: recebimentoId },
      data:  { status: 'CANCELADO' },
    });

    // Voltar NF-e para IMPORTADA
    await tx.notaFiscalEntrada.update({
      where: { id: recebimento.notaFiscalId },
      data:  { status: 'IMPORTADA' },
    });
  });

  await registrarAuditoria({
    usuarioId,
    acao:       'ESTORNAR_RECEBIMENTO',
    tabela:     'recebimentos',
    registroId: recebimentoId,
    dadosAntes: { status: 'CONCLUIDO' },
    dadosDepois: { status: 'CANCELADO' },
  });
}
