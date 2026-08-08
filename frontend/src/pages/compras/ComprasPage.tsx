import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pedidosService } from '@/services/api';

// Sub-páginas do módulo de compras
import PedidosCompraPage  from './PedidosCompraPage';
import NotasFiscaisPage   from './NotasFiscaisPage';
import RecebimentosPage   from './RecebimentosPage';
import DivergenciasPage   from './DivergenciasPage';

// Módulo legado (mantido para histórico e entrada rápida)
import ComprasLegadoPage  from './ComprasLegadoPage';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'pedidos' | 'notas' | 'recebimentos' | 'divergencias' | 'legado';

interface TabConfig { id: Tab; label: string; icon: string; badge?: number }

// ── Dashboard rápido ──────────────────────────────────────────────────────────

function DashboardCompras({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const { data } = useQuery({
    queryKey: ['compras-dashboard'],
    queryFn:  () => pedidosService.dashboard(),
    refetchInterval: 30_000,
  });

  const cards = [
    { label: 'Pedidos em aberto',      valor: data?.abertos ?? '—',               cor: 'border-blue-300 bg-blue-50',    icon: 'shopping_cart',   tab: 'pedidos'       as Tab },
    { label: 'NF-e aguardando conf.',  valor: data?.aguardandoConferencia ?? '—',  cor: 'border-amber-300 bg-amber-50',  icon: 'fact_check',      tab: 'notas'         as Tab },
    { label: 'Divergências pendentes', valor: data?.divergencias ?? '—',           cor: 'border-red-300 bg-red-50',      icon: 'warning',         tab: 'divergencias'  as Tab },
    { label: 'Recebimentos hoje',      valor: data?.recebidosHoje ?? '—',          cor: 'border-green-300 bg-green-50',  icon: 'inventory_2',     tab: 'recebimentos'  as Tab },
    { label: 'Pedidos faturados',      valor: data?.faturados ?? '—',              cor: 'border-purple-300 bg-purple-50',icon: 'receipt_long',    tab: 'pedidos'       as Tab },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-on-surface">Compras — Visão Geral</h2>
        <p className="text-sm text-on-surface-variant mt-1">Ciclo completo de aquisição de mercadorias</p>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map(({ label, valor, cor, icon, tab }) => (
          <button key={label} onClick={() => onNavigate(tab)}
            className={`card p-4 text-left border-2 ${cor} hover:scale-[1.02] transition-transform`}>
            <span className={`material-symbols-outlined text-3xl block mb-2 ${
              cor.includes('blue') ? 'text-blue-600' :
              cor.includes('amber') ? 'text-amber-600' :
              cor.includes('red') ? 'text-red-600' :
              cor.includes('green') ? 'text-green-600' : 'text-purple-600'
            }`}>{icon}</span>
            <p className="text-2xl font-bold text-on-surface">{valor}</p>
            <p className="text-xs text-on-surface-variant mt-1">{label}</p>
          </button>
        ))}
      </div>

      {/* Fluxo visual */}
      <div className="card p-5">
        <h3 className="text-sm font-bold uppercase text-on-surface-variant mb-4">Fluxo de Recebimento</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: 'Pedido de Compra', icon: 'shopping_cart',  tab: 'pedidos'      as Tab },
            { label: 'Importar NF-e',    icon: 'upload_file',    tab: 'notas'        as Tab },
            { label: 'Conferência',      icon: 'fact_check',     tab: 'notas'        as Tab },
            { label: 'Divergências',     icon: 'warning',        tab: 'divergencias' as Tab },
            { label: 'Recebimento',      icon: 'inventory_2',    tab: 'recebimentos' as Tab },
            { label: 'Estoque',          icon: 'warehouse',      tab: null           as any  },
          ].map(({ label, icon, tab }, idx, arr) => (
            <div key={label} className="flex items-center gap-2">
              <button onClick={() => tab && onNavigate(tab)}
                className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition ${
                  tab ? 'bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer' : 'bg-green-100 text-green-700 cursor-default'}`}>
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
                {label}
              </button>
              {idx < arr.length - 1 && <span className="material-symbols-outlined text-on-surface-variant text-[20px]">arrow_forward</span>}
            </div>
          ))}
        </div>
        <p className="text-xs text-on-surface-variant mt-4 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          <strong>Princípio fundamental:</strong> Importar NF-e <strong>não</strong> atualiza o estoque automaticamente.
          O estoque só é alterado após a confirmação do recebimento.
        </p>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ComprasPage() {
  const [tab, setTab] = useState<Tab>('dashboard');

  const { data: dashData } = useQuery({
    queryKey: ['compras-dashboard'],
    queryFn:  () => pedidosService.dashboard(),
    refetchInterval: 30_000,
  });

  const tabs: TabConfig[] = [
    { id: 'dashboard',     label: 'Dashboard',      icon: 'dashboard' },
    { id: 'pedidos',       label: 'Pedidos',         icon: 'shopping_cart' },
    { id: 'notas',         label: 'Notas Fiscais',   icon: 'receipt_long',
      badge: dashData?.aguardandoConferencia > 0 ? dashData.aguardandoConferencia : undefined },
    { id: 'recebimentos',  label: 'Recebimentos',    icon: 'inventory_2' },
    { id: 'divergencias',  label: 'Divergências',    icon: 'warning',
      badge: dashData?.divergencias > 0 ? dashData.divergencias : undefined },
    { id: 'legado',        label: 'Entradas (v1)',   icon: 'history' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* Tabs */}
      <div className="flex gap-1 border-b border-outline-variant overflow-x-auto">
        {tabs.map(({ id, label, icon, badge }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition relative border-b-2 -mb-px ${
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline'}`}>
            <span className="material-symbols-outlined text-[18px]">{icon}</span>
            {label}
            {badge !== undefined && (
              <span className="ml-1 min-w-[18px] h-[18px] rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center px-1">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo por tab */}
      {tab === 'dashboard'    && <DashboardCompras onNavigate={setTab} />}
      {tab === 'pedidos'      && <PedidosCompraPage />}
      {tab === 'notas'        && <NotasFiscaisPage />}
      {tab === 'recebimentos' && <RecebimentosPage />}
      {tab === 'divergencias' && <DivergenciasPage />}
      {tab === 'legado'       && <ComprasLegadoPage />}
    </div>
  );
}
