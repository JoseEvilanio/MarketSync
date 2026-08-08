import { formatCurrency } from '@/utils/format';

export interface ConferenciaItem {
  nfeItemId: string;
  produtoId: string | null;
  produtoNome: string | null;
  codigoFornecedor: string;
  descricaoNfe: string;
  identificado: boolean;
  quantidadePedida: number | null;
  quantidadeNfe: number;
  quantidadeReceber: number;
  valorUnitario: number;
  tipoDivergencia: string | null;
}

interface Props {
  itens: ConferenciaItem[];
  onChange: (itemId: string, qtd: number) => void;
  onIdentificar?: (item: ConferenciaItem) => void;
  readonly?: boolean;
}

const DIVERGENCIA_INFO: Record<string, { label: string; cor: string; icon: string }> = {
  QUANTIDADE_MENOR:       { label: 'Qtd menor que pedido',    cor: 'text-amber-600 bg-amber-50 border-amber-200',   icon: 'arrow_downward' },
  QUANTIDADE_MAIOR:       { label: 'Qtd maior que pedido',    cor: 'text-orange-600 bg-orange-50 border-orange-200', icon: 'arrow_upward'   },
  PRECO_DIFERENTE:        { label: 'Preço diferente',         cor: 'text-blue-600 bg-blue-50 border-blue-200',       icon: 'price_change'   },
  PRODUTO_NAO_SOLICITADO: { label: 'Não consta no pedido',    cor: 'text-purple-600 bg-purple-50 border-purple-200', icon: 'help'           },
  PRODUTO_NAO_IDENTIFICADO: { label: 'Produto não identificado', cor: 'text-red-600 bg-red-50 border-red-200',      icon: 'error'          },
};

export default function ConferenciaTable({ itens, onChange, onIdentificar, readonly = false }: Props) {
  const totalDivergencias = itens.filter((i) => i.tipoDivergencia).length;
  const naoIdentificados  = itens.filter((i) => !i.identificado).length;

  return (
    <div className="space-y-3">
      {/* Resumo */}
      {(totalDivergencias > 0 || naoIdentificados > 0) && (
        <div className="flex gap-3">
          {naoIdentificados > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <strong>{naoIdentificados}</strong> produto(s) não identificado(s) — necessário identificar antes de confirmar
            </div>
          )}
          {totalDivergencias > naoIdentificados && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
              <span className="material-symbols-outlined text-[18px]">warning</span>
              <strong>{totalDivergencias}</strong> divergência(s) detectada(s)
            </div>
          )}
        </div>
      )}

      {/* Tabela */}
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
            {itens.map((item) => {
              const div = item.tipoDivergencia ? DIVERGENCIA_INFO[item.tipoDivergencia] : null;
              const rowBg = !item.identificado
                ? 'bg-red-50/40'
                : item.tipoDivergencia
                ? 'bg-amber-50/30'
                : '';

              return (
                <tr key={item.nfeItemId} className={`${rowBg} hover:bg-surface-container-low/50 transition`}>
                  {/* Produto */}
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
                        {onIdentificar && !readonly && (
                          <button type="button" onClick={() => onIdentificar(item)}
                            className="text-xs text-primary bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-lg transition shrink-0">
                            Identificar
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Qtd Pedida */}
                  <td className="td text-right px-3 py-2.5 text-data-mono">
                    {item.quantidadePedida !== null ? item.quantidadePedida : '—'}
                  </td>

                  {/* Qtd NF-e */}
                  <td className="td text-right px-3 py-2.5 text-data-mono">
                    {item.quantidadeNfe}
                  </td>

                  {/* Qtd Receber (editável) */}
                  <td className="td text-right px-3 py-2.5">
                    {readonly ? (
                      <span className="text-data-mono font-semibold">{item.quantidadeReceber}</span>
                    ) : (
                      <input
                        type="number" min={0} step={0.001}
                        value={item.quantidadeReceber}
                        onChange={(e) => onChange(item.nfeItemId, parseFloat(e.target.value) || 0)}
                        disabled={!item.identificado}
                        className="input input-sm w-20 text-right font-mono disabled:opacity-50"
                      />
                    )}
                  </td>

                  {/* Valor Unit */}
                  <td className="td text-right px-3 py-2.5 text-data-mono">
                    {formatCurrency(item.valorUnitario)}
                  </td>

                  {/* Status */}
                  <td className="td text-center px-3 py-2.5">
                    {!item.identificado ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
                        <span className="material-symbols-outlined text-[12px]">error</span>
                        Não identificado
                      </span>
                    ) : div ? (
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${div.cor}`}>
                        <span className="material-symbols-outlined text-[12px]">{div.icon}</span>
                        {div.label}
                      </span>
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

      {/* Totais */}
      <div className="flex justify-between text-sm text-on-surface-variant px-1">
        <span>{itens.length} item(s) no total</span>
        <span>
          Total NF-e: <strong className="text-on-surface">
            {formatCurrency(itens.reduce((a, i) => a + i.quantidadeReceber * i.valorUnitario, 0))}
          </strong>
        </span>
      </div>
    </div>
  );
}
