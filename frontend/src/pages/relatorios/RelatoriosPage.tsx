import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { relatoriosService } from '@/services/api';
import { formatCurrency, formatDate } from '@/utils/format';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

type Tab = 'vendas' | 'produtos' | 'operadores' | 'estoque' | 'caixa';

function hoje() { return new Date().toISOString().slice(0, 10); }
function inicioMes() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }

export default function RelatoriosPage() {
  const [tab, setTab]           = useState<Tab>('vendas');
  const [dataInicio, setInicio] = useState(inicioMes());
  const [dataFim, setFim]       = useState(hoje());
  const [agrup, setAgrup]       = useState('DIA');

  const { data: vendas, isLoading: loadV } = useQuery({
    queryKey: ['rel-vendas', dataInicio, dataFim, agrup],
    queryFn: () => relatoriosService.vendasPeriodo({ dataInicio, dataFim, agrupamento: agrup }),
    enabled: tab === 'vendas',
  });

  const { data: produtos, isLoading: loadP } = useQuery({
    queryKey: ['rel-produtos', dataInicio, dataFim],
    queryFn: () => relatoriosService.vendasProduto({ dataInicio, dataFim, limit: 20 }),
    enabled: tab === 'produtos',
  });

  const { data: operadores, isLoading: loadO } = useQuery({
    queryKey: ['rel-operadores', dataInicio, dataFim],
    queryFn: () => relatoriosService.vendasOperador({ dataInicio, dataFim }),
    enabled: tab === 'operadores',
  });

  const { data: estoque, isLoading: loadE } = useQuery({
    queryKey: ['rel-estoque'],
    queryFn: relatoriosService.estoqueCritico,
    enabled: tab === 'estoque',
  });

  const { data: caixa, isLoading: loadC } = useQuery({
    queryKey: ['rel-caixa', dataInicio, dataFim],
    queryFn: () => relatoriosService.caixa({ dataInicio, dataFim }),
    enabled: tab === 'caixa',
  });

  const totalVendas = (vendas || []).reduce((a: number, v: any) => a + Number(v.total), 0);
  const qtdVendas   = (vendas || []).reduce((a: number, v: any) => a + Number(v.quantidade), 0);

  const chartData = (vendas || []).map((v: any) => ({
    name: v.periodo,
    total: Number(v.total),
    quantidade: Number(v.quantidade),
  }));

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-md">
        <h3 className="text-headline-lg text-on-surface">Relatórios</h3>
      </div>

      {/* Filtros de data */}
      <div className="card p-md mb-md flex flex-wrap gap-md items-end">
        <div>
          <label className="label">Data Início</label>
          <input type="date" value={dataInicio} onChange={(e) => setInicio(e.target.value)} className="input w-40" />
        </div>
        <div>
          <label className="label">Data Fim</label>
          <input type="date" value={dataFim} onChange={(e) => setFim(e.target.value)} className="input w-40" />
        </div>
        {tab === 'vendas' && (
          <div>
            <label className="label">Agrupamento</label>
            <select value={agrup} onChange={(e) => setAgrup(e.target.value)} className="input">
              <option value="DIA">Dia</option>
              <option value="SEMANA">Semana</option>
              <option value="MES">Mês</option>
            </select>
          </div>
        )}
        <div className="flex gap-xs ml-auto flex-wrap">
          {([
            { key: 'hoje', label: 'Hoje' },
            { key: 'semana', label: '7 dias' },
            { key: 'mes', label: 'Este mês' },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => {
              const h = hoje();
              if (key === 'hoje') { setInicio(h); setFim(h); }
              else if (key === 'semana') {
                const d = new Date(); d.setDate(d.getDate() - 7);
                setInicio(d.toISOString().slice(0, 10)); setFim(h);
              } else { setInicio(inicioMes()); setFim(h); }
            }} className="btn-outline text-body-sm py-1 px-sm">
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-xs mb-md border-b border-outline-variant overflow-x-auto">
        {([
          { key: 'vendas', label: 'Vendas por Período', icon: 'bar_chart' },
          { key: 'produtos', label: 'Por Produto', icon: 'inventory_2' },
          { key: 'operadores', label: 'Por Operador', icon: 'person' },
          { key: 'estoque', label: 'Estoque Crítico', icon: 'warning' },
          { key: 'caixa', label: 'Caixa', icon: 'account_balance_wallet' },
        ] as const).map(({ key, label, icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-xs px-md py-sm text-body-md font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}>
            <span className="material-symbols-outlined text-[18px]">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Vendas por período */}
      {tab === 'vendas' && (
        <div className="space-y-md">
          <div className="grid grid-cols-3 gap-md">
            <div className="card p-md hover:border-primary transition-colors">
              <p className="text-label-md text-on-surface-variant uppercase">Total no Período</p>
              <p className="text-headline-lg font-bold text-on-surface mt-xs">{formatCurrency(totalVendas)}</p>
            </div>
            <div className="card p-md hover:border-primary transition-colors">
              <p className="text-label-md text-on-surface-variant uppercase">Qtd Vendas</p>
              <p className="text-headline-lg font-bold text-on-surface mt-xs">{qtdVendas}</p>
            </div>
            <div className="card p-md hover:border-primary transition-colors">
              <p className="text-label-md text-on-surface-variant uppercase">Ticket Médio</p>
              <p className="text-headline-lg font-bold text-on-surface mt-xs">
                {qtdVendas > 0 ? formatCurrency(totalVendas / qtdVendas) : 'R$ 0,00'}
              </p>
            </div>
          </div>

          <div className="card p-md">
            {loadV ? <LoadingSpinner /> : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="total" name="Total" fill="#091426" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-on-surface-variant text-body-sm">
                Sem vendas no período selecionado
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="p-md border-b border-outline-variant bg-[#f1f5f9]">
              <h4 className="text-headline-md text-on-surface">Detalhe por {agrup === 'DIA' ? 'Dia' : agrup === 'SEMANA' ? 'Semana' : 'Mês'}</h4>
            </div>
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="th">Período</th>
                  <th className="th text-right">Qtd Vendas</th>
                  <th className="th text-right">Total</th>
                  <th className="th text-right">Ticket Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {(vendas || []).map((v: any) => (
                  <tr key={v.periodo} className="tr-hover">
                    <td className="td text-body-sm font-medium text-on-surface">{v.periodo}</td>
                    <td className="td text-right text-data-mono">{Number(v.quantidade)}</td>
                    <td className="td text-right text-data-mono font-semibold">{formatCurrency(v.total)}</td>
                    <td className="td text-right text-data-mono text-on-surface-variant">{formatCurrency(Number(v.ticket_medio))}</td>
                  </tr>
                ))}
                {(!vendas || vendas.length === 0) && !loadV && (
                  <tr><td colSpan={4} className="py-10 text-center text-on-surface-variant text-body-sm">Sem dados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Por produto */}
      {tab === 'produtos' && (
        <div className="card overflow-hidden">
          {loadP ? <LoadingSpinner /> : (
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="th">#</th>
                  <th className="th">Produto</th>
                  <th className="th">Categoria</th>
                  <th className="th text-right">Qtd Vendida</th>
                  <th className="th text-right">Total (R$)</th>
                  <th className="th text-right">Nº Vendas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {(produtos || []).map((p: any, i: number) => (
                  <tr key={p.id} className="tr-hover">
                    <td className="td text-label-md font-bold text-on-surface-variant">{i + 1}º</td>
                    <td className="td">
                      <p className="text-body-sm font-medium text-on-surface">{p.nome}</p>
                      <p className="text-label-md text-on-surface-variant">{p.codigoBarras}</p>
                    </td>
                    <td className="td text-body-sm text-on-surface-variant">{p.categoria || '—'}</td>
                    <td className="td text-right text-data-mono">{Number(p.quantidade).toFixed(2)}</td>
                    <td className="td text-right text-data-mono font-semibold text-secondary">{formatCurrency(p.total)}</td>
                    <td className="td text-right text-data-mono">{p.num_vendas}</td>
                  </tr>
                ))}
                {(!produtos || produtos.length === 0) && (
                  <tr><td colSpan={6} className="py-10 text-center text-on-surface-variant text-body-sm">Sem dados</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Por operador */}
      {tab === 'operadores' && (
        <div className="card overflow-hidden">
          {loadO ? <LoadingSpinner /> : (
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="th">Operador</th>
                  <th className="th text-right">Nº Vendas</th>
                  <th className="th text-right">Total (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {(operadores || []).map((o: any) => (
                  <tr key={o.id} className="tr-hover">
                    <td className="td text-body-sm font-medium text-on-surface">{o.nome}</td>
                    <td className="td text-right text-data-mono">{Number(o.num_vendas)}</td>
                    <td className="td text-right text-data-mono font-semibold">{formatCurrency(o.total)}</td>
                  </tr>
                ))}
                {(!operadores || operadores.length === 0) && (
                  <tr><td colSpan={3} className="py-10 text-center text-on-surface-variant text-body-sm">Sem dados</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Estoque crítico */}
      {tab === 'estoque' && (
        <div className="card overflow-hidden">
          {loadE ? <LoadingSpinner /> : (
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="th">Produto</th>
                  <th className="th">Categoria</th>
                  <th className="th">Fornecedor</th>
                  <th className="th text-right">Est. Mín.</th>
                  <th className="th text-right">Est. Atual</th>
                  <th className="th text-right">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {(estoque || []).map((p: any) => (
                  <tr key={p.id} className="tr-hover bg-warning-container/20">
                    <td className="td">
                      <p className="text-body-sm font-medium text-on-surface">{p.nome}</p>
                      <p className="text-label-md text-on-surface-variant">{p.codigoBarras}</p>
                    </td>
                    <td className="td text-body-sm text-on-surface-variant">{p.categoriaNome || '—'}</td>
                    <td className="td text-body-sm text-on-surface-variant">{p.fornecedorNome || '—'}</td>
                    <td className="td text-right text-data-mono text-on-surface-variant">{p.estoqueMinimo}</td>
                    <td className="td text-right text-data-mono font-bold text-[#b45309]">{p.estoqueAtual}</td>
                    <td className="td text-right text-data-mono font-bold text-error">
                      {Number(p.estoqueAtual) - Number(p.estoqueMinimo)}
                    </td>
                  </tr>
                ))}
                {(!estoque || estoque.length === 0) && (
                  <tr><td colSpan={6} className="py-10 text-center text-success text-body-sm">
                    ✓ Todos os estoques estão acima do mínimo
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Caixa */}
      {tab === 'caixa' && (
        <div className="space-y-md">
          {loadC ? <LoadingSpinner /> : (caixa || []).map((c: any) => {
            const movs = c.movimentos || [];
            const totalVend = movs.filter((m: any) => m.tipo === 'VENDA').reduce((a: number, m: any) => a + Number(m.valor), 0);
            const totalSang = movs.filter((m: any) => m.tipo === 'SANGRIA').reduce((a: number, m: any) => a + Number(m.valor), 0);
            return (
              <div key={c.id} className="card overflow-hidden">
                <div className="p-md bg-[#f1f5f9] border-b border-outline-variant flex flex-wrap gap-md items-center">
                  <div>
                    <p className="text-label-md text-on-surface-variant uppercase">Abertura</p>
                    <p className="text-body-sm font-medium">{formatDate(c.aberturaEm)}</p>
                  </div>
                  <div>
                    <p className="text-label-md text-on-surface-variant uppercase">Operador</p>
                    <p className="text-body-sm font-medium">{c.usuario?.nome}</p>
                  </div>
                  <div>
                    <p className="text-label-md text-on-surface-variant uppercase">Status</p>
                    <span className={`badge ${c.status === 'ABERTO' ? 'badge-success' : 'badge-neutral'}`}>{c.status}</span>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-label-md text-on-surface-variant uppercase">Vendas</p>
                    <p className="text-headline-md font-bold text-secondary">{formatCurrency(totalVend)}</p>
                  </div>
                  {c.valorContado !== null && (
                    <div className="text-right">
                      <p className="text-label-md text-on-surface-variant uppercase">Diferença</p>
                      <p className={`text-headline-md font-bold ${Number(c.diferenca) >= 0 ? 'text-success' : 'text-error'}`}>
                        {formatCurrency(c.diferenca)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {(!caixa || caixa.length === 0) && !loadC && (
            <div className="card p-xl text-center text-on-surface-variant text-body-sm">
              Nenhum caixa no período selecionado
            </div>
          )}
        </div>
      )}
    </div>
  );
}
