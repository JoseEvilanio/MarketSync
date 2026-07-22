import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { relatoriosService } from '@/services/api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function MetricCard({
  title, value, sub, icon, color = 'primary', action, onAction,
}: {
  title: string; value: string; sub?: string; icon: string;
  color?: 'primary' | 'success' | 'warning' | 'error';
  action?: string; onAction?: () => void;
}) {
  const colors = {
    primary: 'bg-surface border-outline-variant',
    success: 'bg-success-container border-success/30',
    warning: 'bg-warning-container border-warning/30',
    error: 'bg-error-container border-error/20',
  };
  const iconColors = {
    primary: 'text-primary bg-surface-container-high',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10',
    error: 'text-error bg-error/10',
  };
  const textColors = {
    primary: 'text-on-surface', success: 'text-[#166534]',
    warning: 'text-[#92400e]', error: 'text-on-error-container',
  };

  return (
    <div className={`card ${colors[color]} p-md flex flex-col justify-between hover:border-primary transition-colors`}>
      <div className="flex justify-between items-start mb-sm">
        <h3 className="text-label-md text-on-surface-variant uppercase">{title}</h3>
        <div className={`p-1.5 rounded-md ${iconColors[color]}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>
      <div>
        <p className={`text-headline-lg font-bold ${textColors[color]}`}>{value}</p>
        {sub && <p className="text-body-sm text-on-surface-variant mt-1 flex items-center gap-xs">{sub}</p>}
        {action && (
          <button onClick={onAction} className="text-label-md text-error mt-2 hover:underline flex items-center gap-xs">
            {action} <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: relatoriosService.dashboard,
    refetchInterval: 60_000,
  });

  if (isLoading) return <LoadingSpinner text="Carregando dashboard..." />;

  const d = data || {};
  const chartData = (d.maiVendidos || []).slice(0, 7).map((p: any) => ({
    name: p.nome?.split(' ').slice(0, 2).join(' '),
    valor: Number(p.total_valor),
  }));

  return (
    <div className="max-w-7xl mx-auto space-y-container-margin">
      {/* Alertas de caixa */}
      {!d.caixaAberto && (
        <div className="bg-warning-container border border-warning/30 rounded-xl p-md flex items-center justify-between">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-warning">warning</span>
            <p className="text-body-md text-[#92400e] font-medium">Nenhum caixa aberto. Abra o caixa para registrar vendas.</p>
          </div>
          <button onClick={() => navigate('/caixa')} className="btn-primary text-body-sm">
            Abrir Caixa
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        <MetricCard
          title="Vendas Hoje"
          value={formatCurrency(d.vendasHoje || 0)}
          sub={`${d.quantidadeVendasHoje || 0} venda(s)`}
          icon="point_of_sale"
        />
        <MetricCard
          title="Vendas Semana"
          value={formatCurrency(d.vendasSemana || 0)}
          icon="calendar_view_week"
        />
        <MetricCard
          title="Lucro Hoje"
          value={formatCurrency(d.lucroHoje || 0)}
          sub="Estimado (margem)"
          icon="trending_up"
          color="success"
        />
        <MetricCard
          title="Estoque Baixo"
          value={`${d.produtosEstoqueBaixo || 0} Itens`}
          icon="warning"
          color={d.produtosEstoqueBaixo > 0 ? 'error' : 'primary'}
          action={d.produtosEstoqueBaixo > 0 ? 'Ver Estoque' : undefined}
          onAction={() => navigate('/estoque')}
        />
      </div>

      {/* Segunda linha KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        <MetricCard
          title="Vendas do Mês"
          value={formatCurrency(d.vendasMes || 0)}
          icon="calendar_month"
        />
        <MetricCard
          title="Ticket Médio"
          value={formatCurrency(d.ticketMedio || 0)}
          icon="receipt_long"
        />
        <MetricCard
          title="Caixa"
          value={d.caixaAberto ? formatCurrency(d.caixaAberto.valorEmCaixa || 0) : '—'}
          sub={d.caixaAberto ? `Aberto por ${d.caixaAberto.usuario?.nome}` : 'Nenhum caixa aberto'}
          icon="account_balance_wallet"
          color={d.caixaAberto ? 'success' : 'primary'}
        />
        <MetricCard
          title="Total de Produtos"
          value={String(d.totalProdutos || 0)}
          sub={`${d.semVenda || 0} sem venda (30d)`}
          icon="inventory_2"
        />
      </div>

      {/* Gráfico + Transações recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        {/* Gráfico */}
        <div className="lg:col-span-2 card flex flex-col">
          <div className="p-md border-b border-outline-variant flex justify-between items-center">
            <h3 className="text-headline-md text-on-surface">Produtos Mais Vendidos (30 dias)</h3>
          </div>
          <div className="p-md flex-1 min-h-[280px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="valor" fill="#091426" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-on-surface-variant text-body-sm">
                Sem dados de vendas no período
              </div>
            )}
          </div>
        </div>

        {/* Mais vendidos lista */}
        <div className="card flex flex-col">
          <div className="p-md border-b border-outline-variant flex justify-between items-center">
            <h3 className="text-headline-md text-on-surface">Top Produtos</h3>
            <button onClick={() => navigate('/relatorios')} className="text-label-md text-primary hover:underline">
              Ver tudo
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-surface-container">
            {(d.maiVendidos || []).slice(0, 8).map((p: any, i: number) => (
              <div key={p.id} className="flex items-center gap-sm px-md py-sm hover:bg-surface-container-low">
                <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-label-md text-on-primary font-bold shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-medium text-on-surface truncate">{p.nome}</p>
                  <p className="text-label-md text-on-surface-variant">{Number(p.total_qty).toFixed(0)} un</p>
                </div>
                <p className="text-data-mono font-semibold text-on-surface shrink-0">
                  {formatCurrency(p.total_valor)}
                </p>
              </div>
            ))}
            {(!d.maiVendidos || d.maiVendidos.length === 0) && (
              <div className="p-md text-center text-on-surface-variant text-body-sm">
                Sem dados ainda
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
