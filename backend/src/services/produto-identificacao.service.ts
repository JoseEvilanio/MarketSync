import { PrismaClient } from '@prisma/client';
import prisma from '../config/prisma';

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type OrigemIdentificacao = 'EAN' | 'CODIGO_FORNECEDOR' | 'NAO_IDENTIFICADO';

export interface ItemParaIdentificar {
  notaFiscalItemId: string;
  codigoFornecedor: string;
  gtin: string | null;
  descricao: string;
}

export interface IdentificacaoResult {
  notaFiscalItemId: string;
  produtoId: string | null;
  produtoNome: string | null;
  origem: OrigemIdentificacao;
  identificado: boolean;
}

// ── Serviço ───────────────────────────────────────────────────────────────────

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Tenta identificar cada item da NF-e na ordem:
 * 1. GTIN/EAN no campo codigoBarras do Produto
 * 2. Associação existente em ProdutoFornecedor (fornecedorId + codigoFornecedor)
 * 3. Não identificado
 */
export async function identificarItensNfe(
  itens: ItemParaIdentificar[],
  fornecedorId: string | null,
  tx?: TxClient
): Promise<IdentificacaoResult[]> {
  const db = (tx ?? prisma) as TxClient;
  const resultados: IdentificacaoResult[] = [];

  for (const item of itens) {
    let produtoId: string | null = null;
    let produtoNome: string | null = null;
    let origem: OrigemIdentificacao = 'NAO_IDENTIFICADO';

    // ── 1. Busca por GTIN/EAN ─────────────────────────────────────────────
    if (item.gtin) {
      const produto = await db.produto.findFirst({
        where: { codigoBarras: item.gtin, deletedAt: null },
        select: { id: true, nome: true },
      });
      if (produto) {
        produtoId   = produto.id;
        produtoNome = produto.nome;
        origem      = 'EAN';
      }
    }

    // ── 2. Busca por código do fornecedor ─────────────────────────────────
    if (!produtoId && fornecedorId && item.codigoFornecedor) {
      const assoc = await (db as any).produtoFornecedor.findFirst({
        where: { fornecedorId, codigoFornecedor: item.codigoFornecedor, ativo: true },
        include: { produto: { select: { id: true, nome: true, deletedAt: true } } },
      });
      if (assoc?.produto && !assoc.produto.deletedAt) {
        produtoId   = assoc.produto.id;
        produtoNome = assoc.produto.nome;
        origem      = 'CODIGO_FORNECEDOR';
      }
    }

    resultados.push({
      notaFiscalItemId: item.notaFiscalItemId,
      produtoId,
      produtoNome,
      origem,
      identificado: produtoId !== null,
    });
  }

  return resultados;
}

/**
 * Associa um item da NF-e a um produto interno.
 * Se salvarRelacionamento=true, persiste em ProdutoFornecedor para uso futuro.
 */
export async function associarProduto(params: {
  notaFiscalItemId: string;
  produtoId: string;
  fornecedorId: string | null;
  codigoFornecedor: string;
  gtin: string | null;
  descricaoFornecedor: string;
  salvarRelacionamento: boolean;
}): Promise<void> {
  // Atualizar o item da NF-e com o produto identificado
  await (prisma as any).notaFiscalItem.update({
    where: { id: params.notaFiscalItemId },
    data: { produtoId: params.produtoId, identificado: true },
  });

  // Persistir relacionamento produto × fornecedor
  if (params.salvarRelacionamento && params.fornecedorId) {
    await (prisma as any).produtoFornecedor.upsert({
      where: {
        fornecedorId_codigoFornecedor: {
          fornecedorId:     params.fornecedorId,
          codigoFornecedor: params.codigoFornecedor,
        },
      },
      create: {
        produtoId:           params.produtoId,
        fornecedorId:        params.fornecedorId,
        codigoFornecedor:    params.codigoFornecedor,
        gtin:                params.gtin,
        descricaoFornecedor: params.descricaoFornecedor,
        ativo:               true,
      },
      update: {
        produtoId:           params.produtoId,
        gtin:                params.gtin ?? undefined,
        descricaoFornecedor: params.descricaoFornecedor,
        ativo:               true,
      },
    });
  }
}
