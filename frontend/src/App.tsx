import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { configService } from '@/services/api';
import MainLayout from '@/layouts/MainLayout';
import LoginPage from '@/pages/auth/LoginPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import PDVPage from '@/pages/pdv/PDVPage';
import ProdutosPage from '@/pages/produtos/ProdutosPage';
import EstoquePage from '@/pages/estoque/EstoquePage';
import CaixaPage from '@/pages/caixa/CaixaPage';
import ClientesPage from '@/pages/clientes/ClientesPage';
import FornecedoresPage from '@/pages/fornecedores/FornecedoresPage';
import ComprasPage from '@/pages/compras/ComprasPage';
import RelatoriosPage from '@/pages/relatorios/RelatoriosPage';
import VendasPage from '@/pages/pdv/VendasPage';
import UsuariosPage from '@/pages/usuarios/UsuariosPage';
import ConfiguracoesPage from '@/pages/configuracoes/ConfiguracoesPage';
import AcessoNegadoPage from '@/pages/auth/AcessoNegadoPage';
import BackupPage from '@/pages/backup/BackupPage';
import SetupWizard from '@/pages/setup/SetupWizard';

type Perfil = 'ADMINISTRADOR' | 'GERENTE' | 'CAIXA';

// ── Guards ────────────────────────────────────────────────────────────────────

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function PerfilRoute({
  children,
  perfis,
}: {
  children: React.ReactNode;
  perfis: Perfil[];
}) {
  const usuario = useAuthStore((s) => s.usuario);
  if (!usuario) return <Navigate to="/login" replace />;
  if (!perfis.includes(usuario.perfil as Perfil)) {
    return <Navigate to="/acesso-negado" replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const usuario = useAuthStore((s) => s.usuario);
  if (usuario?.perfil === 'CAIXA') return <Navigate to="/pdv" replace />;
  return <Navigate to="/dashboard" replace />;
}

// ── First-run checker ─────────────────────────────────────────────────────────
// Verifica no backend se é o primeiro acesso e redireciona para /setup se sim.

function FirstRunGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    configService
      .getEmpresa()
      .then(({ primeiroAcesso }) => {
        if (primeiroAcesso && location.pathname !== '/setup') {
          navigate('/setup', { replace: true });
        } else if (!primeiroAcesso && location.pathname === '/setup') {
          navigate('/login', { replace: true });
        }
      })
      .catch(() => {
        // Se o backend não respondeu, deixa seguir normalmente
      })
      .finally(() => setChecked(true));
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!checked) {
    // Tela mínima de loading enquanto verifica
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  return <>{children}</>;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <FirstRunGuard>
      <Routes>
        {/* Setup wizard — sem autenticação, sem layout */}
        <Route path="/setup" element={<SetupWizard />} />

        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<HomeRedirect />} />

          {/* ── Acesso negado ── */}
          <Route path="acesso-negado" element={<AcessoNegadoPage />} />

          {/* ── CAIXA, GERENTE, ADMINISTRADOR ── */}
          <Route path="pdv" element={<PDVPage />} />
          <Route path="caixa" element={<CaixaPage />} />
          <Route path="configuracoes" element={<ConfiguracoesPage />} />

          {/* ── GERENTE + ADMINISTRADOR ── */}
          <Route
            path="dashboard"
            element={
              <PerfilRoute perfis={['ADMINISTRADOR', 'GERENTE']}>
                <DashboardPage />
              </PerfilRoute>
            }
          />
          <Route
            path="produtos"
            element={
              <PerfilRoute perfis={['ADMINISTRADOR', 'GERENTE']}>
                <ProdutosPage />
              </PerfilRoute>
            }
          />
          <Route
            path="estoque"
            element={
              <PerfilRoute perfis={['ADMINISTRADOR', 'GERENTE']}>
                <EstoquePage />
              </PerfilRoute>
            }
          />
          <Route
            path="clientes"
            element={
              <PerfilRoute perfis={['ADMINISTRADOR', 'GERENTE']}>
                <ClientesPage />
              </PerfilRoute>
            }
          />
          <Route
            path="fornecedores"
            element={
              <PerfilRoute perfis={['ADMINISTRADOR', 'GERENTE']}>
                <FornecedoresPage />
              </PerfilRoute>
            }
          />
          <Route
            path="compras"
            element={
              <PerfilRoute perfis={['ADMINISTRADOR', 'GERENTE']}>
                <ComprasPage />
              </PerfilRoute>
            }
          />
          <Route
            path="relatorios"
            element={
              <PerfilRoute perfis={['ADMINISTRADOR', 'GERENTE']}>
                <RelatoriosPage />
              </PerfilRoute>
            }
          />
          <Route
            path="vendas"
            element={
              <PerfilRoute perfis={['ADMINISTRADOR', 'GERENTE']}>
                <VendasPage />
              </PerfilRoute>
            }
          />

          {/* ── Somente ADMINISTRADOR ── */}
          <Route
            path="usuarios"
            element={
              <PerfilRoute perfis={['ADMINISTRADOR']}>
                <UsuariosPage />
              </PerfilRoute>
            }
          />
          <Route
            path="backup"
            element={
              <PerfilRoute perfis={['ADMINISTRADOR']}>
                <BackupPage />
              </PerfilRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </FirstRunGuard>
  );
}
