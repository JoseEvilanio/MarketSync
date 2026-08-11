import { useQuery } from '@tanstack/react-query';
import { notasFiscaisService } from '@/services/api';
import { formatDateTime } from '@/utils/format';

const EVENTO_CFG: Record<string, { icon: string; cor: string }> = {
  NFE_IMPORTADA:              { icon: 'upload_file',      cor: 'text-blue-600 bg-blue-100' },
  FORNECEDOR_IDENTIFICADO:    { icon: 'store',            cor: 'text-green-600 bg-green-100' },
  FORNECEDOR_NAO_ENCONTRADO:  { icon: 'store_off',        cor: 'text-amber-600 bg-amber-100' },
  PRODUTO_IDENTIFICADO:       { icon: 'inventory_2',      cor: 'text-teal-600 bg-teal-100' },
  PEDIDO_VINCULADO:           { icon: 'link',             cor: 'text-indigo-600 bg-indigo-100' },
  CONFERENCIA_INICIADA:       { icon: 'fact_check',       cor: 'text-purple-600 bg-purple-100' },
  DIVERGENCIA_DETECTADA:      { icon: 'warning',          cor: 'text-amber-600 bg-amber-100' },
  DIVERGENCIA_AUTORIZADA:     { icon: 'check_circle',     cor: 'text-orange-600 bg-orange-100' },
  RECEBIMENTO_CONFIRMADO:     { icon: 'inventory',        cor: 'text-green-600 bg-green-100' },
  RECEBIMENTO_ESTORNADO:      { icon: 'undo',             cor: 'text-red-600 bg-red-100' },
  NFE_CANCELADA:              { icon: 'cancel',           cor: 'text-red-600 bg-red-100' },
  CIENCIA_OPERACAO:           { icon: 'visibility',       cor: 'text-blue-600 bg-blue-100' },
  CONFIRMACAO_OPERACAO:       { icon: 'verified',         cor: 'text-green-600 bg-green-100' },
  DESCONHECIMENTO_OPERACAO:   { icon: 'help',             cor: 'text-amber-600 bg-amber-100' },
  OPERACAO_NAO_REALIZADA:     { icon: 'block',            cor: 'text-red-600 bg-red-100' },
  CANCELAMENTO_SEFAZ:         { icon: 'gavel',            cor: 'text-red-600 bg-red-100' },
  CARTA_CORRECAO:             { icon: 'edit_document',    cor: 'text-blue-600 bg-blue-100' },
};

interface Props {
  nfeId: string;
}

export default function NfeTimeline({ nfeId }: Props) {
  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ['nfe-eventos', nfeId],
    queryFn:  () => notasFiscaisService.listarEventos(nfeId),
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <span className="material-symbols-outlined animate-spin text-primary text-2xl">progress_activity</span>
      </div>
    );
  }

  if (eventos.length === 0) {
    return (
      <div className="text-center py-6 text-on-surface-variant text-sm">
        <span className="material-symbols-outlined text-3xl block mb-1">timeline</span>
        Nenhum evento registrado
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Linha vertical */}
      <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-outline-variant" />

      <div className="space-y-1">
        {eventos.map((ev: any, idx: number) => {
          const cfg = EVENTO_CFG[ev.tipo] ?? { icon: 'info', cor: 'text-gray-600 bg-gray-100' };
          return (
            <div key={ev.id} className="flex gap-3 relative pl-2">
              {/* Ícone */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${cfg.cor}`}>
                <span className="material-symbols-outlined text-[14px]">{cfg.icon}</span>
              </div>

              {/* Conteúdo */}
              <div className={`flex-1 pb-3 ${idx < eventos.length - 1 ? 'border-b border-outline-variant/50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-on-surface leading-snug">{ev.descricao}</p>
                  <span className="text-xs text-on-surface-variant whitespace-nowrap shrink-0 mt-0.5">
                    {formatDateTime(ev.createdAt)}
                  </span>
                </div>
                {ev.usuario?.nome && (
                  <p className="text-xs text-on-surface-variant mt-0.5">por {ev.usuario.nome}</p>
                )}
                {ev.dados && Object.keys(ev.dados).length > 0 && (
                  <details className="mt-1">
                    <summary className="text-xs text-primary cursor-pointer hover:underline">Detalhes</summary>
                    <pre className="text-xs bg-surface-container-low rounded p-2 mt-1 overflow-x-auto text-on-surface-variant">
                      {JSON.stringify(ev.dados, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
