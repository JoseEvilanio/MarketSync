import { PrismaClient } from '@prisma/client';
import prisma from '../config/prisma';

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type OrigemIdentificacao = 'EAN' | 'CODIGO_FORNECEDOR' | 'NAO_IDENTIFICADO';

export interface ItemParaIdentificar {
  notaFiscalItemId: string;
  codigoFornecedor: string;
  gtin:             string | null;
  descricao:        string;
}

export interface IdentificacaoResult {
  notaFiscalItemId: string;
  produtoId:        string | null;
  produtoNome:      string | null;
  origem:           OrigemIdentificacao;
  identificado:     boolean;
}

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// ── Serviço ───────────────────────────────────────────────────────────────────

/**
 * Tenta identificar cada item da NF-e na ordem:
 * 1. GTIN/EAN → campo codigoBarras do Produto
 * 2. Código do fornecedor → ProdutoFornecedor
 * 3. Não identificado
 *
 * Persiste o statusIdentificacao no banco (não apenas calcula).
 */
export async function identificarItensNfe(
  itens:       ItemParaIdentificar[],
  fornecedorId: string | null,
  tx?:         TxClient
): Promise<IdentificacaoResult[]> {
  const db  = (tx ?? prisma) as any;
  const res: IdentificacaoResult[] = [];

  for (const item of itens) {
    let produtoId:   string | null = null;
    let produtoNome: string | null = null;
    let origem:      OrigemIdentificacao = 'NAO_IDENTIFICADO';

    // ── 1. Busca por GTIN/EAN ─────────────────────────────────────────────
    if (item.gtin) {
      const produto = await db.produto.findFirst({
        where:  { codigoBarras: item.gtin, deletedAt: null },
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
      const assoc = await db.produtoFornecedor.findFirst({
        where:   { fornecedorId, codigoFornecedor: item.codigoFornecedor, ativo: true },
        include: { produto: { select: { id: true, nome: true, deletedAt: true } } },
      });
      if (assoc?.produto && !assoc.produto.deletedAt) {
        produtoId   = assoc.produto.id;
        produtoNome = assoc.produto.nome;
        origem      = 'CODIGO_FORNECEDOR';
      }
    }

    // ── Persistir resultado no item da NF-e ───────────────────────────────
    const statusIdentificacao =
      origem === 'EAN'               ? 'IDENTIFICADO_EAN'
      : origem === 'CODIGO_FORNECEDOR' ? 'IDENTIFICADO_CODIGO_FORNECEDOR'
      : 'NAO_IDENTIFICADO';

    await db.notaFiscalItem.update({
      where: { id: item.notaFiscalItemId },
      data: {
        produtoId,
        identificado:        produtoId !== null,
        statusIdentificacao,
      },
    });

    res.push({ notaFiscalItemId: item.notaFiscalItemId, produtoId, produtoNome, origem, identificado: produtoId !== null });
  }

  return res;
}

/**
 * Associa manualmente um item da NF-e a um produto interno.
 * Seta statusIdentificacao = 'IDENTIFICADO_MANUAL'.
 * Se salvarRelacionamento=true, faz upsert em ProdutoFornecedor.
 */
export async function associarProduto(params: {
  notaFiscalItemId:    string;
  produtoId:           string;
  fornecedorId:        string | null;
  codigoFornecedor:    string;
  gtin:                string | null;
  descricaoFornecedor: string;
  salvarRelacionamento: boolean;
}): Promise<void> {
  await (prisma as any).notaFiscalItem.update({
    where: { id: params.notaFiscalItemId },
    data: {
      produtoId:           params.produtoId,
      identificado:        true,
      statusIdentificacao: 'IDENTIFICADO_MANUAL',
    },
  });

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
