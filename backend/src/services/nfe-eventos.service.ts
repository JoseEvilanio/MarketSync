import prisma from '../config/prisma';

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type TipoEventoNfe =
  | 'NFE_IMPORTADA'
  | 'FORNECEDOR_IDENTIFICADO'
  | 'FORNECEDOR_NAO_ENCONTRADO'
  | 'PRODUTO_IDENTIFICADO'
  | 'PEDIDO_VINCULADO'
  | 'CONFERENCIA_INICIADA'
  | 'DIVERGENCIA_DETECTADA'
  | 'DIVERGENCIA_AUTORIZADA'
  | 'RECEBIMENTO_CONFIRMADO'
  | 'RECEBIMENTO_ESTORNADO'
  | 'NFE_CANCELADA'
  | 'CIENCIA_OPERACAO'
  | 'CONFIRMACAO_OPERACAO'
  | 'DESCONHECIMENTO_OPERACAO'
  | 'OPERACAO_NAO_REALIZADA'
  | 'CANCELAMENTO_SEFAZ'
  | 'CARTA_CORRECAO';

export interface RegistrarEventoParams {
  nfeId:       string;
  tipo:        TipoEventoNfe;
  descricao:   string;
  usuarioId?:  string;
  dados?:      Record<string, unknown>;
}

/**
 * Registra um evento na linha do tempo da NF-e.
 * Fire-and-forget: nunca propaga exceção — falha silenciosa para não
 * interromper o fluxo principal de negócio.
 */
export function registrarEventoNfe(params: RegistrarEventoParams): void {
  (prisma as any).eventoNfe
    .create({
      data: {
        nfeId:     params.nfeId,
        tipo:      params.tipo,
        descricao: params.descricao,
        usuarioId: params.usuarioId ?? null,
        dados:     params.dados ?? null,
      },
    })
    .catch(() => {
      // Ignorar erros — eventos são auditoria não-crítica
    });
}

/**
 * Busca todos os eventos de uma NF-e em ordem cronológica.
 */
export async function listarEventosNfe(nfeId: string) {
  return (prisma as any).eventoNfe.findMany({
    where:   { nfeId },
    include: { usuario: { select: { nome: true } } },
    orderBy: { createdAt: 'asc' },
  });
}
