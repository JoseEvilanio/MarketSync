import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { registrarAuditoria } from '../utils/auditoria';
import { registrarEventoNfe } from './nfe-eventos.service';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ItemReceber {
  notaFiscalItemId: string;
  produtoId:        string;
  quantidade:       number;
  valorUnitario:    number;
}

export interface ConfirmarRecebimentoParams {
  notaFiscalId: string;
  usuarioId:    string;
  itens:        ItemReceber[];
  observacao?:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Preço médio ponderado entre estoque atual e novo lote. */
function calcularCustoMedio(
  estoqueAtual: number,
  custoAtual:   number,
  qtdNova:      number,
  precoNovo:    number
): number {
  const totalQtd = estoqueAtual + qtdNova;
  if (totalQtd <= 0) return precoNovo;
  return (estoqueAtual * custoAtual + qtdNova * precoNovo) / totalQtd;
}

// ── Confirmar recebimento ─────────────────────────────────────────────────────

/**
 * Confirma o recebimento em transação atômica:
 * 1. Cria Recebimento + RecebimentoItem
 * 2. ENTRADA_NFE no MovimentoEstoque
 * 3. Atualiza estoqueAtual
 * 4. Atualiza precoCompra (último custo) e custoMedio (médio ponderado) — separados
 * 5. Marca NF-e como RECEBIDA
 * 6. Atualiza quantidadeRecebida nos PedidoCompraItems
 * 7. Atualiza status dos pedidos vinculados
 * 8. Registra auditoria + evento
 *
 * Guard de idempotência: rejeita com 409 se NF-e já está RECEBIDA.
 * ROLLBACK automático em qualquer falha.
 */
export async function confirmarRecebimento(params: ConfirmarRecebimentoParams) {
  const { notaFiscalId, usuarioId, itens, observacao } = params;

  if (itens.length === 0) throw new AppError('Nenhum item informado para recebimento', 400);

  // Idempotência — fora da transação
  const nf = await (prisma as any).notaFiscalEntrada.findUnique({
    where:   { id: notaFiscalId },
    include: {
      nfePedidos: { include: { pedido: { include: { itens: true } } } },
    },
  });
  if (!nf) throw new AppError('Nota Fiscal não encontrada', 404);

  if (nf.status === 'RECEBIDA') {
    // Buscar dados do recebimento original para mensagem clara
    const recAnterior = await (prisma as any).recebimento.findFirst({
      where:   { notaFiscalId, status: 'CONCLUIDO' },
      include: { usuario: { select: { nome: true } } },
      orderBy: { createdAt: 'asc' },
    });
    throw new AppError(
      `NF-e já recebida em ${recAnterior?.dataRecebimento?.toLocaleString('pt-BR') ?? '?'} ` +
      `por ${recAnterior?.usuario?.nome ?? 'usuário desconhecido'}. ` +
      `Operação bloqueada para evitar duplicidade.`,
      409
    );
  }

  if (nf.situacaoFiscal === 'DENEGADA') {
    throw new AppError(
      'Esta NF-e foi denegada pela SEFAZ e não pode ser recebida.',
      422
    );
  }

  const pedidos = (nf.nfePedidos ?? []).map((np: any) => np.pedido);

  // ── Transação atômica ─────────────────────────────────────────────────────
  const recebimento = await prisma.$transaction(async (tx: any) => {
    const rec = await tx.recebimento.create({
      data: {
        notaFiscalId,
        usuarioId,
        status:          'CONCLUIDO',
        dataRecebimento: new Date(),
        observacao,
      },
    });

    for (const item of itens) {
      const produto = await tx.produto.findUnique({
        where:  { id: item.produtoId },
        select: { id: true, estoqueAtual: true, precoCompra: true, custoMedio: true },
      });
      if (!produto) throw new AppError(`Produto ${item.produtoId} não encontrado`, 404);

      const saldoAntes  = produto.estoqueAtual;
      const saldoDepois = saldoAntes + item.quantidade;

      // Custo médio usa o custoMedio atual (ou precoCompra se custoMedio ainda não existe)
      const custoAtual   = Number(produto.custoMedio ?? produto.precoCompra ?? 0);
      const novoCustoMedio = calcularCustoMedio(saldoAntes, custoAtual, item.quantidade, item.valorUnitario);

      await tx.recebimentoItem.create({
        data: {
          recebimentoId: rec.id,
          produtoId:     item.produtoId,
          quantidade:    item.quantidade,
          valorUnitario: item.valorUnitario,
          subtotal:      item.quantidade * item.valorUnitario,
        },
      });

      await tx.movimentoEstoque.create({
        data: {
          produtoId:  item.produtoId,
          tipo:       'ENTRADA_NFE',
          quantidade: item.quantidade,
          saldoAntes,
          saldoDepois,
          referencia: notaFiscalId,
          motivo:     `Recebimento NF-e ${nf.numero}-${nf.serie}`,
        },
      });

      await tx.produto.update({
        where: { id: item.produtoId },
        data: {
          estoqueAtual: saldoDepois,
          precoCompra:  item.valorUnitario, // último custo desta NF-e
          custoMedio:   novoCustoMedio,     // médio ponderado
          ...(nf.fornecedorId ? { fornecedorId: nf.fornecedorId } : {}),
        },
      });

      // Atualizar quantidadeRecebida nos pedidos vinculados
      for (const pedido of pedidos) {
        const pi = pedido.itens.find((p: any) => p.produtoId === item.produtoId);
        if (pi) {
          await tx.pedidoCompraItem.update({
            where: { id: pi.id },
            data:  { quantidadeRecebida: { increment: item.quantidade } },
          });
        }
      }
    }

    // Marcar NF-e como RECEBIDA
    await tx.notaFiscalEntrada.update({
      where: { id: notaFiscalId },
      data:  { status: 'RECEBIDA' },
    });

    // Atualizar status dos pedidos
    for (const pedido of pedidos) {
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
      const novoStatus = todosConcluidos ? 'RECEBIDO' : algumRecebido ? 'PARCIAL' : null;
      if (novoStatus && novoStatus !== pedidoAtualizado.status) {
        await tx.pedidoCompra.update({ where: { id: pedido.id }, data: { status: novoStatus } });
      }
    }

    return rec;
  });

  // Auditoria + evento (fora da transação — falha silenciosa nos eventos)
  await registrarAuditoria({
    usuarioId,
    acao:       'CONFIRMAR_RECEBIMENTO',
    tabela:     'recebimentos',
    registroId: recebimento.id,
    dadosDepois: { notaFiscalId, totalItens: itens.length, observacao },
  });

  registrarEventoNfe({
    nfeId:     notaFiscalId,
    tipo:      'RECEBIMENTO_CONFIRMADO',
    descricao: `Recebimento confirmado: ${itens.length} item(s) — estoque atualizado`,
    usuarioId,
    dados:     { recebimentoId: recebimento.id, totalItens: itens.length },
  });

  return recebimento;
}

// ── Estornar recebimento ──────────────────────────────────────────────────────

export async function estornarRecebimento(recebimentoId: string, usuarioId: string) {
  const rec = await (prisma as any).recebimento.findUnique({
    where:   { id: recebimentoId },
    include: { itens: { include: { produto: true } }, notaFiscal: true },
  });
  if (!rec) throw new AppError('Recebimento não encontrado', 404);
  if (rec.status === 'CANCELADO') throw new AppError('Recebimento já foi estornado', 409);

  await prisma.$transaction(async (tx: any) => {
    for (const item of rec.itens) {
      const produto = await tx.produto.findUnique({
        where:  { id: item.produtoId },
        select: { estoqueAtual: true },
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
          referencia: rec.notaFiscalId,
          motivo:     `Estorno NF-e ${rec.notaFiscal.numero}-${rec.notaFiscal.serie}`,
        },
      });

      await tx.produto.update({ where: { id: item.produtoId }, data: { estoqueAtual: saldoDepois } });
    }

    await tx.recebimento.update({ where: { id: recebimentoId }, data: { status: 'CANCELADO' } });
    await tx.notaFiscalEntrada.update({ where: { id: rec.notaFiscalId }, data: { status: 'IMPORTADA' } });
  });

  await registrarAuditoria({
    usuarioId,
    acao:       'ESTORNAR_RECEBIMENTO',
    tabela:     'recebimentos',
    registroId: recebimentoId,
    dadosAntes:  { status: 'CONCLUIDO' },
    dadosDepois: { status: 'CANCELADO' },
  });

  registrarEventoNfe({
    nfeId:     rec.notaFiscalId,
    tipo:      'RECEBIMENTO_ESTORNADO',
    descricao: `Recebimento estornado — estoque revertido`,
    usuarioId,
    dados:     { recebimentoId },
  });
}
