import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { recebimentosService } from '@/services/api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ResolverDivergenciaModal from '@/components/compras/ResolverDivergenciaModal';

const TIPO_CFG: Record<string, { label: string; cls: string; icon: string }> = {
  QUANTIDADE_MENOR:         { label: 'Qtd menor',          cls: 'bg-amber-100 text-amber-700',  icon: 'arrow_downward'  },
  QUANTIDADE_MAIOR:         { label: 'Qtd maior',          cls: 'bg-orange-100 text-orange-700', icon: 'arrow_upward'   },
  PRECO_DIFERENTE:          { label: 'Preço diferente',    cls: 'bg-blue-100 text-blue-700',     icon: 'price_change'   },
  PRODUTO_NAO_SOLICITADO:   { label: 'Não solicitado',     cls: 'bg-purple-100 text-purple-700', icon: 'help'           },
  PRODUTO_NAO_IDENTIFICADO: { label: 'Não identificado',   cls: 'bg-red-100 text-red-700',       icon: 'error'          },
};

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  PENDENTE:  { label: 'Pendente',  cls: 'bg-amber-100 text-amber-700' },
  RESOLVIDA: { label: 'Resolvida', cls: 'badge-success' },
  IGNORADA:  { label: 'Ignorada',  cls: 'badge-neutral' },
};

export default function DivergenciasPage() {
  const qc = useQueryClient();
  const [page, setPage]       = useState(1);
  const [filtroStatus, setFiltroStatus] = useState('PENDENTE');
  const [resolvendo, setResolvendo]     = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['divergencias', page, filtroStatus],
    queryFn: () => recebimentosService.listarDivergencias({ page, limit: 20, status: filtroStatus }),
  });

  const divergencias = data?.data || [];
  const total        = data?.total || 0;
  const totalPages   = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Divergências</h2>
          <p className="text-sm text-on-surface-variant">{total} divergência(s)</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {['PENDENTE', 'RESOLVIDA', 'IGNORADA', ''].map((s) => (
          <button key={s} onClick={() => { setFiltroStatus(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
              filtroStatus === s ? 'bg-primary text-white border-primary' : 'bg-white text-on-surface-variant border-outline hover:border-primary'}`}>
            {s === '' ? 'Todas' : STATUS_CFG[s]?.label ?? s}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner /> : (
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="th">NF-e</th><th className="th">Fornecedor</th>
                <th className="th">Produto</th><th className="th text-center">Tipo</th>
                <th className="th text-right">Qtd Pedida</th><th className="th text-right">Qtd NF-e</th>
                <th className="th text-right">Preço NF-e</th><th className="th text-center">Status</th>
                <th className="th">Data</th><th className="th w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {divergencias.map((d: any) => {
                const tipo  = TIPO_CFG[d.tipo] || { label: d.tipo, cls: 'badge-neutral', icon: 'warning' };
                const st    = STATUS_CFG[d.status] || { label: d.status, cls: 'badge-neutral' };
                return (
                  <tr key={d.id} className="tr-hover group">
                    <td className="td text-data-mono font-semibold text-sm">
                      {d.notaFiscal?.numero}-{d.notaFiscal?.serie}
                    </td>
                    <td className="td text-sm">{d.notaFiscal?.fornecedor?.nome || '—'}</td>
                    <td className="td text-sm">
                      <p>{d.produto?.nome || d.descricaoItem || '—'}</p>
                    </td>
                    <td className="td text-center">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${tipo.cls}`}>
                        <span className="material-symbols-outlined text-[12px]">{tipo.icon}</span>
                        {tipo.label}
                      </span>
                    </td>
                    <td className="td text-right text-data-mono">{d.quantidadePedida ?? '—'}</td>
                    <td className="td text-right text-data-mono">{d.quantidadeNfe ?? '—'}</td>
                    <td className="td text-right text-data-mono">{d.precoNfe ? formatCurrency(d.precoNfe) : '—'}</td>
                    <td className="td text-center">
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="td text-sm text-on-surface-variant">{formatDateTime(d.createdAt)}</td>
                    <td className="td">
                      {d.status === 'PENDENTE' && (
                        <button onClick={() => setResolvendo(d)}
                          className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-lg transition opacity-0 group-hover:opacity-100">
                          <span className="material-symbols-outlined text-[14px]">edit</span>
                          Resolver
                        </button>
                      )}
                      {d.resolvidoPor && (
                        <p className="text-xs text-on-surface-variant">por {d.resolvidoPor.nome}</p>
                      )}
                    </td>
                  </tr>
                );
              })}
              {divergencias.length === 0 && (
                <tr><td colSpan={10} className="py-12 text-center text-on-surface-variant text-sm">
                  {filtroStatus === 'PENDENTE' ? '✓ Nenhuma divergência pendente' : 'Nenhuma divergência encontrada'}
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

      <ResolverDivergenciaModal open={!!resolvendo} onClose={() => setResolvendo(null)}
        divergencia={resolvendo}
        onSuccess={() => { setResolvendo(null); qc.invalidateQueries({ queryKey: ['divergencias'] }); }} />
    </div>
  );
}
