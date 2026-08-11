import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { notasFiscaisService } from '@/services/api';
import { formatCurrency, formatDate } from '@/utils/format';

interface Pedido {
  id:        string;
  numero:    number;
  status:    string;
  total:     number;
  createdAt: string;
}

interface Props {
  nfeId:    string;
  pedidos:  Pedido[];
  onVinculado: (pedidoIds: string[]) => void;
  onPular:  () => void;
}

const STATUS_LABEL: Record<string, string> = {
  ABERTO: 'Aberto', ENVIADO: 'Enviado', FATURADO: 'Faturado',
};

export default function PedidoSugeridoCard({ nfeId, pedidos, onVinculado, onPular }: Props) {
  const { mutate: vincular, isPending } = useMutation({
    mutationFn: (pedidoId: string) =>
      notasFiscaisService.vincularPedido(nfeId, [pedidoId]),
    onSuccess: (_data, pedidoId) => {
      toast.success('Pedido vinculado!');
      onVinculado([pedidoId]);
    },
    onError: (e: any) => toast.error(e?.response?.data?.erro || 'Erro ao vincular pedido'),
  });

  if (pedidos.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-on-surface flex items-center gap-1.5">
        <span className="material-symbols-outlined text-primary text-[18px]">shopping_cart</span>
        Pedido(s) sugerido(s) para este fornecedor
      </p>

      <div className="border border-blue-200 rounded-xl overflow-hidden">
        {pedidos.map((p, idx) => (
          <div key={p.id}
            className={`flex items-center gap-3 px-4 py-3 ${
              idx < pedidos.length - 1 ? 'border-b border-blue-100' : ''
            } bg-blue-50/50`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-on-surface">Pedido #{p.numero}</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">
                {formatDate(p.createdAt)} · {formatCurrency(p.total)}
              </p>
            </div>
            <button type="button"
              onClick={() => vincular(p.id)}
              disabled={isPending}
              className="shrink-0 flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {isPending
                ? <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                : <span className="material-symbols-outlined text-[14px]">link</span>}
              Vincular
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={onPular}
        className="text-xs text-on-surface-variant hover:text-on-surface underline">
        Pular — continuar sem vincular pedido
      </button>
    </div>
  );
}
