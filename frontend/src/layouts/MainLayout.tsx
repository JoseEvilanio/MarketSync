import { Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import Sidebar from '@/components/ui/Sidebar';
import TopNav from '@/components/ui/TopNav';

const pageTitles: Record<string, string> = {
  '/dashboard':    'Dashboard',
  '/pdv':          'Frente de Caixa',
  '/produtos':     'Produtos',
  '/estoque':      'Estoque',
  '/caixa':        'Caixa',
  '/clientes':     'Clientes',
  '/fornecedores': 'Fornecedores',
  '/compras':      'Compras',
  '/relatorios':   'Relatórios',
  '/vendas':       'Histórico de Vendas',
  '/usuarios':     'Usuários',
  '/configuracoes':'Configurações',
};

export default function MainLayout() {
  const { pathname } = useLocation();
  const perfil = useAuthStore((s) => s.usuario?.perfil);
  const title = pageTitles[pathname] ?? 'MarketSync';
  const isPDV = pathname === '/pdv';
  const isCaixa = perfil === 'CAIXA';

  if (isPDV) {
    return (
      <div className="h-screen overflow-hidden flex flex-col">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col h-screen overflow-hidden">
        <TopNav title={title} showPDVButton={!isCaixa} />
        <main className="flex-1 overflow-y-auto p-container-margin bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
