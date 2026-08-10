import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import { pedidosService, notasFiscaisService } from '@/services/api';
import { formatCurrency, formatDate } from '@/utils/format';

interface Props {
  open: boolean;
  onClose: () => void;
  notaFiscalId: string;
  fornecedorId: string | null;
  onSuccess: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho', ABERTO: 'Aberto', ENVIADO: 'Enviado',
  FATURADO: 'Faturado', EM_CONFERENCIA: 'Em conferência',
};

export default function VincularPedidoModal({ open, onClose, notaFiscalId, fornecedorId, onSuccess }: Props) {
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['pedidos-abertos', fornecedorId],
    queryFn: () => pedidosService.listar({
      status: 'ABERTO,ENVIADO,FATURADO,EM_CONFERENCIA,PARCIAL',
      fornecedorId: fornecedorId ?? undefined,
      limit: 50,
    }),
    enabled: open,
  });

  const { mutate: vincular, isPending } = useMutation({
    mutationFn: () => notasFiscaisService.vincularPedido(notaFiscalId, selecionados),
    onSuccess: () => {
      toast.success('Pedido(s) vinculado(s) com sucesso!');
      setSelecionados([]);
      onSuccess();
      onClose();
    },
    onError: () => toast.error('Erro ao vincular pedido'),
  });

  function toggle(id: string) {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const pedidos = data?.data || [];

  function handleClose() {
    if (isPending) return;
    setSelecionados([]); onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Vincular Pedido de Compra" size="lg">
      <div className="space-y-4">

        <p className="text-sm text-on-surface-variant">
          Selecione o(s) pedido(s) que esta NF-e está atendendo. A vinculação é opcional.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
          </div>
        ) : pedidos.length === 0 ? (
          <div className="text-center py-8 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl block mb-2">inbox</span>
            <p className="text-sm">Nenhum pedido em aberto encontrado{fornecedorId ? ' para este fornecedor' : ''}.</p>
          </div>
        ) : (
          <div className="border border-outline rounded-xl overflow-hidden divide-y divide-outline-variant max-h-72 overflow-y-auto">
            {pedidos.map((p: any) => (
              <label key={p.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-container-low transition ${
                selecionados.includes(p.id) ? 'bg-primary/5' : ''}`}>
                <input type="checkbox" checked={selecionados.includes(p.id)}
                  onChange={() => toggle(p.id)}
                  className="rounded border-outline text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-on-surface">Pedido #{p.numero}</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    {p.fornecedor?.nome ?? 'Sem fornecedor'} · {formatDate(p.createdAt)} · {formatCurrency(p.total)}
                  </p>
                </div>
                {selecionados.includes(p.id) &&
                  <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>}
              </label>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center border-t border-outline-variant pt-4">
          <button type="button" onClick={() => { onClose(); }}
            className="text-sm text-on-surface-variant hover:text-on-surface">
            Pular — receber sem pedido
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={handleClose} disabled={isPending} className="btn-outline">Cancelar</button>
            <button type="button" onClick={() => vincular()} disabled={selecionados.length === 0 || isPending}
              className="btn-primary flex items-center gap-2">
              {isPending
                ? <><span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>Vinculando...</>
                : <><span className="material-symbols-outlined text-[18px]">link</span>Vincular {selecionados.length > 0 ? `(${selecionados.length})` : ''}</>}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
