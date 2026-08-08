import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { recebimentosService } from '@/services/api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';

export default function RecebimentosPage() {
  const [page, setPage]       = useState(1);
  const [detalhe, setDetalhe] = useState<any>(null);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim]       = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['recebimentos', page, dataInicio, dataFim],
    queryFn: () => recebimentosService.listar({
      page, limit: 20,
      ...(dataInicio && { dataInicio }),
      ...(dataFim   && { dataFim }),
    }),
  });

  const recebimentos = data?.data || [];
  const total        = data?.total || 0;
  const totalPages   = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Histórico de Recebimentos</h2>
          <p className="text-sm text-on-surface-variant">{total} recebimento(s)</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 items-end">
        <div>
          <label className="label">Data início</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Data fim</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="input" />
        </div>
        <button onClick={() => { setDataInicio(''); setDataFim(''); setPage(1); }}
          className="btn-outline text-sm py-2">Limpar</button>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner /> : (
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="th">NF-e</th><th className="th">Fornecedor</th>
                <th className="th text-center">Itens</th><th className="th text-right">Valor Total</th>
                <th className="th">Recebido por</th><th className="th">Data</th><th className="th w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {recebimentos.map((r: any) => (
                <tr key={r.id} className="tr-hover group">
                  <td className="td">
                    <p className="font-semibold text-data-mono">{r.notaFiscal?.numero}-{r.notaFiscal?.serie}</p>
                  </td>
                  <td className="td text-sm">{r.notaFiscal?.fornecedor?.nome || '—'}</td>
                  <td className="td text-center text-sm">{r._count?.itens ?? '—'}</td>
                  <td className="td text-right text-data-mono font-semibold">{formatCurrency(r.notaFiscal?.valorTotal ?? 0)}</td>
                  <td className="td text-sm">{r.usuario?.nome}</td>
                  <td className="td text-sm text-on-surface-variant">{formatDateTime(r.dataRecebimento)}</td>
                  <td className="td">
                    <button onClick={async () => setDetalhe(await recebimentosService.buscarId(r.id))}
                      className="p-1 text-primary hover:bg-surface-container-low rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="material-symbols-outlined text-[18px]">visibility</span>
                    </button>
                  </td>
                </tr>
              ))}
              {recebimentos.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-on-surface-variant text-sm">Nenhum recebimento encontrado</td></tr>
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

      {/* Modal Detalhe */}
      {detalhe && (
        <Modal open={!!detalhe} onClose={() => setDetalhe(null)} title={`Recebimento — NF-e ${detalhe.notaFiscal?.numero}`} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><span className="label">Fornecedor</span><p>{detalhe.notaFiscal?.fornecedor?.nome || '—'}</p></div>
              <div><span className="label">Recebido por</span><p>{detalhe.usuario?.nome}</p></div>
              <div><span className="label">Data</span><p>{formatDateTime(detalhe.dataRecebimento)}</p></div>
              {detalhe.observacao && <div className="col-span-3"><span className="label">Obs.</span><p>{detalhe.observacao}</p></div>}
            </div>
            <table className="w-full card overflow-hidden text-sm">
              <thead className="table-header"><tr>
                <th className="th">Produto</th><th className="th text-right">Qtd</th>
                <th className="th text-right">Valor Unit.</th><th className="th text-right">Subtotal</th>
              </tr></thead>
              <tbody className="divide-y divide-surface-container">
                {(detalhe.itens || []).map((i: any) => (
                  <tr key={i.id} className="tr-hover">
                    <td className="td">{i.produto?.nome}</td>
                    <td className="td text-right text-data-mono">{i.quantidade}</td>
                    <td className="td text-right text-data-mono">{formatCurrency(i.valorUnitario)}</td>
                    <td className="td text-right text-data-mono font-bold">{formatCurrency(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end font-bold text-lg pt-2">
              Total: {formatCurrency((detalhe.itens || []).reduce((a: number, i: any) => a + Number(i.subtotal), 0))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
