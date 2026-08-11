import prisma from '../config/prisma';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ClassificacaoDivergencia = 'BLOQUEANTE' | 'ALERTA';

type TipoDivergencia =
  | 'QUANTIDADE_MENOR'
  | 'QUANTIDADE_MAIOR'
  | 'PRECO_DIFERENTE'
  | 'PRODUTO_NAO_SOLICITADO'
  | 'PRODUTO_NAO_IDENTIFICADO'
  | 'PRODUTO_FALTANTE';

// ── Classificação ─────────────────────────────────────────────────────────────

/**
 * Divergências BLOQUEANTES impedem confirmação do recebimento.
 * Divergências ALERTA podem ser autorizadas por GERENTE/ADMINISTRADOR.
 */
export function classificarDivergencia(tipo: TipoDivergencia): ClassificacaoDivergencia {
  const bloqueantes: TipoDivergencia[] = ['PRODUTO_NAO_IDENTIFICADO'];
  return bloqueantes.includes(tipo) ? 'BLOQUEANTE' : 'ALERTA';
}

// ── Calcular e persistir divergências ────────────────────────────────────────

export interface ResumoDivergencias {
  bloqueantes: number;
  alertas:     number;
  total:       number;
}

/**
 * Calcula e persiste divergências entre a NF-e e os pedidos vinculados.
 * Usa upsert por (notaFiscalId, produtoId, tipo) para evitar duplicatas.
 * Pode ser chamada dentro de uma transação Prisma ou independentemente.
 */
export async function calcularEPersistirDivergencias(
  nfeId: string,
  tx?: any
): Promise<ResumoDivergencias> {
  const db = tx ?? (prisma as any);

  // Buscar NF-e com itens e pedidos vinculados (via NfePedido)
  const nfe = await db.notaFiscalEntrada.findUnique({
    where:   { id: nfeId },
    include: {
      itens:     true,
      nfePedidos: {
        include: {
          pedido: { include: { itens: { include: { produto: true } } } },
        },
      },
    },
  });
  if (!nfe) return { bloqueantes: 0, alertas: 0, total: 0 };

  const pedidos = (nfe.nfePedidos ?? []).map((np: any) => np.pedido);

  // Montar mapa produto → { quantidade pedida, preço pedido } de todos os pedidos
  const pedidoMap = new Map<string, { quantidade: number; precoUnitario: number }>();
  for (const pedido of pedidos) {
    for (const pi of pedido.itens) {
      const key = pi.produtoId;
      const ex  = pedidoMap.get(key);
      if (ex) {
        ex.quantidade += pi.quantidade;
      } else {
        pedidoMap.set(key, {
          quantidade:    pi.quantidade,
          precoUnitario: Number(pi.precoUnitario),
        });
      }
    }
  }

  const divergenciasACriar: Array<{
    tipo:            TipoDivergencia;
    produtoId:       string | null;
    descricaoItem:   string;
    quantidadePedida: number | null;
    quantidadeNfe:   number | null;
    precoPedido:     number | null;
    precoNfe:        number | null;
  }> = [];

  // Analisar cada item da NF-e
  for (const item of nfe.itens) {
    // Produto não identificado → BLOQUEANTE
    if (!item.identificado || !item.produtoId) {
      divergenciasACriar.push({
        tipo:             'PRODUTO_NAO_IDENTIFICADO',
        produtoId:        null,
        descricaoItem:    item.descricao,
        quantidadePedida: null,
        quantidadeNfe:    item.quantidade,
        precoPedido:      null,
        precoNfe:         Number(item.valorUnitario),
      });
      continue;
    }

    const pedidoInfo = pedidoMap.get(item.produtoId);

    // Produto na NF-e mas não no pedido
    if (!pedidoInfo && pedidos.length > 0) {
      divergenciasACriar.push({
        tipo:             'PRODUTO_NAO_SOLICITADO',
        produtoId:        item.produtoId,
        descricaoItem:    item.descricao,
        quantidadePedida: 0,
        quantidadeNfe:    item.quantidade,
        precoPedido:      null,
        precoNfe:         Number(item.valorUnitario),
      });
      continue;
    }

    if (!pedidoInfo) continue; // sem pedido vinculado — OK

    // Verificar quantidade
    const difQtd = item.quantidade - pedidoInfo.quantidade;
    if (Math.abs(difQtd) > 0.001) {
      divergenciasACriar.push({
        tipo:             difQtd < 0 ? 'QUANTIDADE_MENOR' : 'QUANTIDADE_MAIOR',
        produtoId:        item.produtoId,
        descricaoItem:    item.descricao,
        quantidadePedida: pedidoInfo.quantidade,
        quantidadeNfe:    item.quantidade,
        precoPedido:      pedidoInfo.precoUnitario,
        precoNfe:         Number(item.valorUnitario),
      });
    }

    // Verificar preço (tolerância de R$ 0,01)
    const difPreco = Math.abs(Number(item.valorUnitario) - pedidoInfo.precoUnitario);
    if (difPreco > 0.01) {
      // Só criar divergência de preço se não criou outra para o mesmo item
      const jaTemDivQtd = divergenciasACriar.some(
        (d) => d.produtoId === item.produtoId && (d.tipo === 'QUANTIDADE_MENOR' || d.tipo === 'QUANTIDADE_MAIOR')
      );
      if (!jaTemDivQtd) {
        divergenciasACriar.push({
          tipo:             'PRECO_DIFERENTE',
          produtoId:        item.produtoId,
          descricaoItem:    item.descricao,
          quantidadePedida: pedidoInfo.quantidade,
          quantidadeNfe:    item.quantidade,
          precoPedido:      pedidoInfo.precoUnitario,
          precoNfe:         Number(item.valorUnitario),
        });
      }
    }

    // Remover do mapa — o que sobrar depois são produtos faltantes
    pedidoMap.delete(item.produtoId);
  }

  // Produtos no pedido que não apareceram na NF-e → PRODUTO_FALTANTE
  for (const [produtoId, info] of pedidoMap.entries()) {
    const produto = await db.produto.findUnique({
      where:  { id: produtoId },
      select: { nome: true },
    });
    divergenciasACriar.push({
      tipo:             'PRODUTO_FALTANTE',
      produtoId,
      descricaoItem:    produto?.nome ?? produtoId,
      quantidadePedida: info.quantidade,
      quantidadeNfe:    0,
      precoPedido:      info.precoUnitario,
      precoNfe:         null,
    });
  }

  // Persistir via upsert-safe (produtoId é nullable — não suporta @@unique direto no Prisma)
  for (const div of divergenciasACriar) {
    const existing = await db.divergencia.findFirst({
      where: {
        notaFiscalId: nfeId,
        tipo:         div.tipo,
        produtoId:    div.produtoId ?? null,
      },
    });

    if (existing) {
      await db.divergencia.update({
        where: { id: existing.id },
        data: {
          status:           'PENDENTE',
          quantidadePedida: div.quantidadePedida,
          quantidadeNfe:    div.quantidadeNfe,
          precoPedido:      div.precoPedido,
          precoNfe:         div.precoNfe,
          descricaoItem:    div.descricaoItem,
        },
      });
    } else {
      await db.divergencia.create({
        data: {
          notaFiscalId:     nfeId,
          tipo:             div.tipo,
          status:           'PENDENTE',
          produtoId:        div.produtoId,
          descricaoItem:    div.descricaoItem,
          quantidadePedida: div.quantidadePedida,
          quantidadeNfe:    div.quantidadeNfe,
          precoPedido:      div.precoPedido,
          precoNfe:         div.precoNfe,
        },
      });
    }
  }

  // Remover divergências antigas que não existem mais
  const tiposAtivos = divergenciasACriar.map((d) => d.tipo);
  if (tiposAtivos.length > 0) {
    // Manter apenas as divergências calculadas agora
    await db.divergencia.updateMany({
      where: {
        notaFiscalId: nfeId,
        status:       'PENDENTE',
        tipo:         { notIn: tiposAtivos },
      },
      data: { status: 'IGNORADA' },
    });
  }

  // Contar resultados
  const bloqueantes = divergenciasACriar.filter(
    (d) => classificarDivergencia(d.tipo) === 'BLOQUEANTE'
  ).length;
  const alertas = divergenciasACriar.length - bloqueantes;

  return { bloqueantes, alertas, total: divergenciasACriar.length };
}
