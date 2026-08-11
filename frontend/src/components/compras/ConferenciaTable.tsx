import { formatCurrency } from '@/utils/format';
import DivergenciaBadge from './DivergenciaBadge';

export interface ConferenciaItem {
  nfeItemId:           string | null;
  produtoId:           string | null;
  produtoNome:         string | null;
  codigoFornecedor:    string;
  descricaoNfe:        string;
  identificado:        boolean;
  statusIdentificacao?: string;
  quantidadePedida:    number | null;
  quantidadeNfe:       number;
  quantidadeReceber:   number;
  valorUnitario:       number;
  tipoDivergencia:     string | null;
  classificacao:       'BLOQUEANTE' | 'ALERTA' | null;
  divergenciaId?:      string | null;
  divergenciaStatus?:  string | null;
}

interface Props {
  itens:                  ConferenciaItem[];
  onChange:               (itemId: string, qtd: number) => void;
  onIdentificar?:         (item: ConferenciaItem) => void;
  onResolverDivergencia?: (item: ConferenciaItem) => void;
  readonly?:              boolean;
}

export default function ConferenciaTable({ itens, onChange, onIdentificar, onResolverDivergencia, readonly = false }: Props) {
  const bloqueantes = itens.filter((i) => i.classificacao === 'BLOQUEANTE').length;
  const alertas     = itens.filter((i) => i.classificacao === 'ALERTA').length;

  return (
    <div className="space-y-3">
      {(bloqueantes > 0 || alertas > 0) && (
        <div className="flex gap-2 flex-wrap">
          {bloqueantes > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <span className="material-symbols-outlined text-[16px]">block</span>
              <strong>{bloqueantes}</strong> item(s) bloqueante(s)
            </div>
          )}
          {alertas > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
              <span className="material-symbols-outlined text-[16px]">warning</span>
              <strong>{alertas}</strong> divergência(s) de alerta
            </div>
          )}
        </div>
      )}

      <div className="border border-outline rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low">
            <tr>
              <th className="th text-left py-2.5 px-4">Produto</th>
              <th className="th text-right py-2.5 px-3">Pedido</th>
              <th className="th text-right py-2.5 px-3">NF-e</th>
              <th className="th text-right py-2.5 px-3">Receber</th>
              <th className="th text-right py-2.5 px-3">Valor Unit.</th>
              <th className="th text-center py-2.5 px-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {itens.map((item, idx) => {
              const rowBg = item.classificacao === 'BLOQUEANTE'
                ? 'bg-red-50/40'
                : item.classificacao === 'ALERTA'
                ? 'bg-amber-50/30'
                : '';
              const key = item.nfeItemId ?? `row-${idx}`;

              return (
                <tr key={key} className={`${rowBg} hover:bg-surface-container-low/50 transition`}>
                  <td className="td px-4 py-2.5">
                    {item.identificado ? (
                      <div>
                        <p className="font-medium text-on-surface">{item.produtoNome}</p>
                        <p className="text-xs text-on-surface-variant">{item.descricaoNfe}</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-on-surface-variant italic">{item.descricaoNfe}</p>
                          <p className="text-xs text-on-surface-variant">Cód: {item.codigoFornecedor}</p>
                        </div>
                        {onIdentificar && !readonly && item.nfeItemId && (
                          <button type="button" onClick={() => onIdentificar(item)}
                            className="text-xs text-primary bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-lg transition shrink-0">
                            Identificar
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="td text-right px-3 py-2.5 text-data-mono">
                    {item.quantidadePedida !== null ? item.quantidadePedida : '—'}
                  </td>
                  <td className="td text-right px-3 py-2.5 text-data-mono">{item.quantidadeNfe}</td>

                  <td className="td text-right px-3 py-2.5">
                    {readonly || !item.nfeItemId ? (
                      <span className="text-data-mono font-semibold">{item.quantidadeReceber}</span>
                    ) : (
                      <input type="number" min={0} step={0.001}
                        value={item.quantidadeReceber}
                        onChange={(e) => item.nfeItemId && onChange(item.nfeItemId, parseFloat(e.target.value) || 0)}
                        disabled={!item.identificado}
                        className="input input-sm w-20 text-right font-mono disabled:opacity-50"
                      />
                    )}
                  </td>

                  <td className="td text-right px-3 py-2.5 text-data-mono">
                    {formatCurrency(item.valorUnitario)}
                  </td>

                  <td className="td text-center px-3 py-2.5">
                    {item.tipoDivergencia ? (
                      <div className="flex flex-col items-center gap-1">
                        <DivergenciaBadge tipo={item.tipoDivergencia} classificacao={item.classificacao} />
                        {onResolverDivergencia && !readonly && item.divergenciaId && item.divergenciaStatus === 'PENDENTE' && (
                          <button type="button" onClick={() => onResolverDivergencia(item)}
                            className="text-[10px] text-primary hover:underline">
                            Resolver
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                        <span className="material-symbols-outlined text-[12px]">check_circle</span>
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between text-xs text-on-surface-variant px-1">
        <span>{itens.length} item(s)</span>
        <span>Total a receber: <strong className="text-on-surface">
          {formatCurrency(itens.reduce((a, i) => a + (i.quantidadeReceber ?? 0) * i.valorUnitario, 0))}
        </strong></span>
      </div>
    </div>
  );
}
