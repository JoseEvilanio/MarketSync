import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { notasFiscaisService } from '@/services/api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ImportarXmlModal from '@/components/compras/ImportarXmlModal';
import VincularPedidoModal from '@/components/compras/VincularPedidoModal';
import ConferenciaPage from './ConferenciaPage';

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  IMPORTADA:          { label: 'Importada',           cls: 'badge-neutral' },
  AGUARDANDO_VINCULO: { label: 'Aguardando vínculo',  cls: 'bg-amber-100 text-amber-700' },
  EM_CONFERENCIA:     { label: 'Em conferência',      cls: 'bg-blue-100 text-blue-700' },
  COM_DIVERGENCIA:    { label: 'Com divergência',     cls: 'bg-orange-100 text-orange-700' },
  APROVADA:           { label: 'Aprovada',            cls: 'bg-teal-100 text-teal-700' },
  RECEBIDA:           { label: 'Recebida',            cls: 'badge-success' },
  CANCELADA:          { label: 'Cancelada',           cls: 'badge-error' },
};

export default function NotasFiscaisPage() {
  const qc = useQueryClient();
  const [page, setPage]             = useState(1);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [modalImportar, setModalImportar] = useState(false);
  const [vincularNf, setVincularNf]  = useState<any | null>(null);
  const [conferenciaId, setConferenciaId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['notas-fiscais', page, filtroStatus],
    queryFn: () => notasFiscaisService.listar({ page, limit: 20, ...(filtroStatus && { status: filtroStatus }) }),
    refetchInterval: 15_000,
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => notasFiscaisService.cancelar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notas-fiscais'] }); toast.success('NF-e cancelada'); },
    onError: (e: any) => toast.error(e?.response?.data?.erro || 'Erro ao cancelar'),
  });

  // Se está em modo conferência, renderiza a página de conferência
  if (conferenciaId) {
    return <ConferenciaPage notaFiscalId={conferenciaId} onVoltar={() => { setConferenciaId(null); qc.invalidateQueries({ queryKey: ['notas-fiscais'] }); }} />;
  }

  const notas      = data?.data || [];
  const total      = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Notas Fiscais de Entrada</h2>
          <p className="text-sm text-on-surface-variant">{total} nota(s)</p>
        </div>
        <button onClick={() => setModalImportar(true)} className="btn-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">upload_file</span>
          Importar NF-e (XML)
        </button>
      </div>

      {/* Filtros de status */}
      <div className="flex gap-2 flex-wrap">
        {['', 'IMPORTADA', 'AGUARDANDO_VINCULO', 'EM_CONFERENCIA', 'COM_DIVERGENCIA', 'RECEBIDA', 'CANCELADA'].map((s) => (
          <button key={s} onClick={() => { setFiltroStatus(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
              filtroStatus === s ? 'bg-primary text-white border-primary' : 'bg-white text-on-surface-variant border-outline hover:border-primary'}`}>
            {s === '' ? 'Todos' : STATUS_CFG[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner /> : (
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="th">NF-e</th><th className="th">Emitente / Fornecedor</th>
                <th className="th text-right">Valor</th><th className="th text-center">Itens</th>
                <th className="th text-center">Status</th><th className="th">Importada em</th>
                <th className="th w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {notas.map((n: any) => {
                const st = STATUS_CFG[n.status] || { label: n.status, cls: 'badge-neutral' };
                const podeConferir = ['AGUARDANDO_VINCULO', 'EM_CONFERENCIA', 'COM_DIVERGENCIA', 'IMPORTADA'].includes(n.status);
                return (
                  <tr key={n.id} className="tr-hover group">
                    <td className="td">
                      <p className="font-semibold text-data-mono text-on-surface">{n.numero}-{n.serie}</p>
                      <p className="text-xs text-on-surface-variant font-mono truncate max-w-[140px]">{n.chaveAcesso}</p>
                    </td>
                    <td className="td text-sm">
                      <p>{n.nomeEmitente || n.fornecedor?.nome || '—'}</p>
                      {n.cnpjEmitente && <p className="text-xs text-on-surface-variant">{n.cnpjEmitente}</p>}
                    </td>
                    <td className="td text-right text-data-mono font-semibold">{formatCurrency(n.valorTotal)}</td>
                    <td className="td text-center text-sm">{n._count?.itens ?? '—'}</td>
                    <td className="td text-center"><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    <td className="td text-sm text-on-surface-variant">{formatDateTime(n.createdAt)}</td>
                    <td className="td">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {podeConferir && (
                          <button onClick={() => setConferenciaId(n.id)}
                            className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-lg transition"
                            title="Conferir / Receber">
                            <span className="material-symbols-outlined text-[16px]">fact_check</span>
                            Conferir
                          </button>
                        )}
                        {!['RECEBIDA', 'CANCELADA'].includes(n.status) && (
                          <button onClick={() => { if (confirm('Cancelar NF-e?')) cancelar.mutate(n.id); }}
                            className="p-1 text-error hover:bg-error-container rounded" title="Cancelar">
                            <span className="material-symbols-outlined text-[18px]">cancel</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {notas.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-on-surface-variant text-sm">
                  Nenhuma NF-e encontrada. Clique em "Importar NF-e" para começar.
                </td></tr>
              )}
            </tbody>
          </table>
        )}
        <div className="px-4 py-3 border-t border-outline-variant flex items-center justify-between bg-surface">
          <span className="text-sm text-on-surface-variant">Pág. {page}/{totalPages || 1}</span>
          <div className="flex gap-1">
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
      </div>

      {/* Modais */}
      <ImportarXmlModal open={modalImportar} onClose={() => setModalImportar(false)}
        onSuccess={(nf) => {
          setModalImportar(false);
          qc.invalidateQueries({ queryKey: ['notas-fiscais'] });
          // Ir direto para conferência após importar
          setConferenciaId(nf.id);
        }} />

      {vincularNf && (
        <VincularPedidoModal open={!!vincularNf} onClose={() => setVincularNf(null)}
          notaFiscalId={vincularNf.id} fornecedorId={vincularNf.fornecedorId}
          onSuccess={() => { setVincularNf(null); qc.invalidateQueries({ queryKey: ['notas-fiscais'] }); }} />
      )}
    </div>
  );
}
