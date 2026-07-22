import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vendasService } from '@/services/api';
import { formatCurrency, formatDateTime, formaPagamentoLabel } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

const statusLabel: Record<string, { label: string; cls: string }> = {
  CONCLUIDA: { label: 'Concluída', cls: 'badge-success' },
  CANCELADA: { label: 'Cancelada', cls: 'badge-error' },
  ABERTA:    { label: 'Aberta',    cls: 'badge-warning' },
};

export default function VendasPage() {
  const qc = useQueryClient();
  const [page, setPage]           = useState(1);
  const [dataInicio, setInicio]   = useState('');
  const [dataFim, setFim]         = useState('');
  const [detalhe, setDetalhe]     = useState<any>(null);
  const [motivoCancel, setMotivo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['vendas', page, dataInicio, dataFim],
    queryFn: () => vendasService.listar({ page, limit: 20, dataInicio: dataInicio || undefined, dataFim: dataFim || undefined }),
  });

  const cancelar = useMutation({
    mutationFn: () => vendasService.cancelar(detalhe!.id, motivoCancel),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendas'] });
      toast.success('Venda cancelada');
      setDetalhe(null);
      setMotivo('');
    },
  });

  const vendas = data?.data || [];
  const total  = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-md">
        <div>
          <h3 className="text-headline-lg text-on-surface">Histórico de Vendas</h3>
          <p className="text-body-md text-on-surface-variant mt-xs">{total} venda(s)</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-md mb-md flex flex-wrap gap-md items-end">
        <div>
          <label className="label">Data Início</label>
          <input type="date" value={dataInicio} onChange={(e) => { setInicio(e.target.value); setPage(1); }} className="input w-40" />
        </div>
        <div>
          <label className="label">Data Fim</label>
          <input type="date" value={dataFim} onChange={(e) => { setFim(e.target.value); setPage(1); }} className="input w-40" />
        </div>
        <button onClick={() => { setInicio(''); setFim(''); setPage(1); }} className="btn-ghost text-body-sm">
          Limpar filtros
        </button>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner /> : (
          <>
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="th">#</th>
                  <th className="th">Data/Hora</th>
                  <th className="th">Operador</th>
                  <th className="th">Cliente</th>
                  <th className="th">Pagamento</th>
                  <th className="th text-right">Total</th>
                  <th className="th text-center">Status</th>
                  <th className="th w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {vendas.map((v: any) => {
                  const st = statusLabel[v.status] || { label: v.status, cls: 'badge-neutral' };
                  return (
                    <tr key={v.id} className={`tr-hover group ${v.status === 'CANCELADA' ? 'opacity-60' : ''}`}>
                      <td className="td text-data-mono font-bold text-on-surface">#{v.numero}</td>
                      <td className="td text-body-sm text-on-surface-variant whitespace-nowrap">
                        {formatDateTime(v.createdAt)}
                      </td>
                      <td className="td text-body-sm text-on-surface">{v.usuario?.nome || '—'}</td>
                      <td className="td text-body-sm text-on-surface-variant">{v.cliente?.nome || 'Consumidor Final'}</td>
                      <td className="td text-body-sm text-on-surface-variant">
                        {formaPagamentoLabel[v.formaPagamento] || v.formaPagamento}
                      </td>
                      <td className="td text-right text-data-mono font-semibold">{formatCurrency(v.total)}</td>
                      <td className="td text-center">
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="td">
                        <button
                          onClick={async () => {
                            const det = await vendasService.buscarId(v.id);
                            setDetalhe(det);
                          }}
                          className="p-1 text-primary hover:bg-surface-container-low rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {vendas.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-on-surface-variant text-body-sm">
                      Nenhuma venda encontrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-md py-sm border-t border-outline-variant flex items-center justify-between bg-surface">
              <span className="text-body-sm text-on-surface-variant">
                {total} venda(s) · Pág. {page}/{totalPages || 1}
              </span>
              <div className="flex gap-xs">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1 rounded text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="p-1 rounded text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal detalhe da venda */}
      {detalhe && (
        <Modal open={!!detalhe} onClose={() => { setDetalhe(null); setMotivo(''); }}
          title={`Venda #${detalhe.numero}`} size="lg">
          <div className="space-y-4">
            {/* Cabeçalho */}
            <div className="grid grid-cols-3 gap-4 text-body-sm">
              <div>
                <span className="label">Data/Hora</span>
                <p className="font-medium">{formatDateTime(detalhe.createdAt)}</p>
              </div>
              <div>
                <span className="label">Operador</span>
                <p className="font-medium">{detalhe.usuario?.nome}</p>
              </div>
              <div>
                <span className="label">Cliente</span>
                <p className="font-medium">{detalhe.cliente?.nome || 'Consumidor Final'}</p>
              </div>
            </div>

            {/* Itens */}
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="th">Produto</th>
                    <th className="th text-right">Qtd</th>
                    <th className="th text-right">Unit.</th>
                    <th className="th text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {(detalhe.itens || []).map((item: any) => (
                    <tr key={item.id} className="tr-hover">
                      <td className="td text-body-sm font-medium text-on-surface">{item.produto?.nome}</td>
                      <td className="td text-right text-data-mono">{item.quantidade}</td>
                      <td className="td text-right text-data-mono">{formatCurrency(item.precoUnit)}</td>
                      <td className="td text-right text-data-mono font-bold">{formatCurrency(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totais e pagamentos */}
            <div className="grid grid-cols-2 gap-4">
              <div className="card p-md space-y-sm">
                <p className="text-label-md text-on-surface-variant uppercase">Pagamentos</p>
                {(detalhe.pagamentos || []).map((p: any, i: number) => (
                  <div key={i} className="flex justify-between text-body-sm">
                    <span>{formaPagamentoLabel[p.formaPagamento]}</span>
                    <span className="text-data-mono font-semibold">{formatCurrency(p.valor)}</span>
                  </div>
                ))}
              </div>
              <div className="card p-md space-y-sm">
                <div className="flex justify-between text-body-sm text-on-surface-variant">
                  <span>Subtotal</span>
                  <span className="text-data-mono">{formatCurrency(detalhe.subtotal)}</span>
                </div>
                {Number(detalhe.desconto) > 0 && (
                  <div className="flex justify-between text-body-sm text-on-surface-variant">
                    <span>Desconto</span>
                    <span className="text-data-mono text-error">-{formatCurrency(detalhe.desconto)}</span>
                  </div>
                )}
                <div className="h-px bg-outline-variant" />
                <div className="flex justify-between font-bold text-body-lg">
                  <span>Total</span>
                  <span className="text-data-mono">{formatCurrency(detalhe.total)}</span>
                </div>
                {Number(detalhe.troco) > 0 && (
                  <div className="flex justify-between text-body-sm text-success">
                    <span>Troco</span>
                    <span className="text-data-mono font-semibold">{formatCurrency(detalhe.troco)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Cancelamento */}
            {detalhe.status === 'CONCLUIDA' && (
              <div className="border-t border-outline-variant pt-4 space-y-2">
                <p className="text-label-md text-on-surface-variant uppercase">Cancelar Venda</p>
                <input
                  value={motivoCancel}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="input"
                  placeholder="Motivo do cancelamento (mínimo 5 caracteres)..."
                />
                <button
                  onClick={() => motivoCancel.length >= 5 && cancelar.mutate()}
                  disabled={motivoCancel.length < 5 || cancelar.isPending}
                  className="btn-danger w-full disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[18px]">cancel</span>
                  {cancelar.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
