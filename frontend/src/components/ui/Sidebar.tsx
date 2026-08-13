import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import clsx from 'clsx';

type Perfil = 'ADMINISTRADOR' | 'GERENTE' | 'CAIXA';

interface NavItem {
  to: string;
  icon: string;
  label: string;
  perfis: Perfil[]; // quais perfis enxergam este item
}

const navItems: NavItem[] = [
  // Admin + Gerente
  { to: '/dashboard',    icon: 'dashboard',             label: 'Dashboard',    perfis: ['ADMINISTRADOR', 'GERENTE'] },
  // Todos
  { to: '/pdv',          icon: 'point_of_sale',          label: 'PDV',          perfis: ['ADMINISTRADOR', 'GERENTE', 'CAIXA'] },
  // Admin + Gerente
  { to: '/produtos',     icon: 'inventory_2',            label: 'Produtos',     perfis: ['ADMINISTRADOR', 'GERENTE'] },
  { to: '/estoque',      icon: 'warehouse',              label: 'Estoque',      perfis: ['ADMINISTRADOR', 'GERENTE'] },
  // Todos (caixa precisa para abrir/fechar)
  { to: '/caixa',        icon: 'account_balance_wallet', label: 'Caixa',        perfis: ['ADMINISTRADOR', 'GERENTE', 'CAIXA'] },
  // Admin + Gerente
  { to: '/clientes',     icon: 'group',                  label: 'Clientes',     perfis: ['ADMINISTRADOR', 'GERENTE'] },
  { to: '/fornecedores', icon: 'local_shipping',         label: 'Fornecedores', perfis: ['ADMINISTRADOR', 'GERENTE'] },
  { to: '/categorias',   icon: 'label',                  label: 'Categorias',   perfis: ['ADMINISTRADOR', 'GERENTE'] },
  { to: '/compras',      icon: 'shopping_cart',          label: 'Compras',      perfis: ['ADMINISTRADOR', 'GERENTE'] },
  { to: '/vendas',       icon: 'receipt_long',           label: 'Vendas',       perfis: ['ADMINISTRADOR', 'GERENTE'] },
  { to: '/relatorios',   icon: 'assessment',             label: 'Relatórios',   perfis: ['ADMINISTRADOR', 'GERENTE'] },
];

const adminItems: NavItem[] = [
  { to: '/backup',        icon: 'archive',         label: 'Backup',        perfis: ['ADMINISTRADOR'] },
  { to: '/usuarios',      icon: 'manage_accounts', label: 'Usuários',      perfis: ['ADMINISTRADOR'] },
  { to: '/configuracoes', icon: 'settings',        label: 'Configurações', perfis: ['ADMINISTRADOR'] },
];

// Item de configurações visível para GERENTE e CAIXA (só alterar senha)
const configItem: NavItem = {
  to: '/configuracoes', icon: 'settings', label: 'Configurações', perfis: ['GERENTE', 'CAIXA'],
};

export default function Sidebar() {
  const { usuario, logout } = useAuthStore();
  const navigate = useNavigate();
  const perfil = usuario?.perfil as Perfil | undefined;

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'flex items-center gap-md px-md py-sm rounded-lg transition-colors duration-150 text-body-md font-medium',
      isActive
        ? 'text-secondary-fixed-dim font-bold border-l-4 border-secondary-fixed-dim bg-on-primary-fixed-variant scale-95'
        : 'text-primary-fixed-dim hover:text-on-primary hover:bg-primary-container'
    );

  const NavItemLink = ({ item }: { item: NavItem }) => (
    <NavLink key={item.to} to={item.to} className={linkClass}>
      {({ isActive }) => (
        <>
          <span
            className="material-symbols-outlined text-[22px]"
            style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
          >
            {item.icon}
          </span>
          {item.label}
        </>
      )}
    </NavLink>
  );

  const visibleNav  = navItems.filter((i) => perfil && i.perfis.includes(perfil));
  const isAdmin     = perfil === 'ADMINISTRADOR';
  const isNonAdmin  = perfil === 'GERENTE' || perfil === 'CAIXA';

  return (
    <nav className="bg-primary text-on-primary h-screen w-64 fixed left-0 top-0 flex flex-col py-lg z-50">
      {/* Logo */}
      <div className="px-md mb-xl flex items-center gap-sm">
        <img src="/logo.png" alt="MercadoPro Logo" className="w-10 h-10 rounded-xl object-contain shadow-md shrink-0" />
        <div>
          <h1 className="text-headline-md font-bold text-on-primary leading-tight">MercadoPro</h1>
          <p className="text-label-md text-on-primary-container">ERP Local</p>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-sm flex flex-col gap-xs">
        {visibleNav.map((item) => (
          <NavItemLink key={item.to} item={item} />
        ))}

        {/* Seção Administração — só admin enxerga */}
        {isAdmin && (
          <>
            <div className="mx-md mt-sm mb-xs border-t border-primary-container" />
            <p className="px-md text-[10px] uppercase tracking-widest text-on-primary-container/60 font-bold">
              Administração
            </p>
            {adminItems.map((item) => (
              <NavItemLink key={item.to} item={item} />
            ))}
          </>
        )}

        {/* Configurações (só senha) — gerente e caixa */}
        {isNonAdmin && (
          <>
            <div className="mx-md mt-sm mb-xs border-t border-primary-container" />
            <NavItemLink item={configItem} />
          </>
        )}
      </div>

      {/* Usuário logado */}
      <div className="px-md mt-auto pt-md border-t border-primary-container">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-sm min-w-0">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <span className="text-on-secondary text-body-sm font-bold">
                {usuario?.nome?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-body-sm text-on-primary font-medium truncate">{usuario?.nome}</p>
              <p className="text-label-md text-on-primary-container capitalize">
                {perfil === 'ADMINISTRADOR' ? 'Administrador' : perfil === 'GERENTE' ? 'Gerente' : 'Caixa'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1 text-primary-fixed-dim hover:text-on-primary transition-colors ml-2"
            title="Sair"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
