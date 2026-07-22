import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';

export default function AcessoNegadoPage() {
  const navigate = useNavigate();
  const usuario = useAuthStore((s) => s.usuario);

  const destino = usuario?.perfil === 'CAIXA' ? '/pdv' : '/dashboard';

  return (
    <div className="flex flex-col items-center justify-center h-full gap-lg text-center px-lg">
      <div className="w-20 h-20 rounded-full bg-error-container flex items-center justify-center">
        <span className="material-symbols-outlined text-error text-[48px]">lock</span>
      </div>
      <div>
        <h2 className="text-headline-lg font-bold text-on-surface">Acesso Negado</h2>
        <p className="text-body-md text-on-surface-variant mt-xs max-w-sm">
          Você não tem permissão para acessar esta área.
          Entre em contato com o administrador do sistema.
        </p>
      </div>
      <div className="flex gap-sm">
        <button
          onClick={() => navigate(destino)}
          className="btn-primary"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Voltar ao início
        </button>
      </div>
      <p className="text-label-md text-on-surface-variant">
        Perfil atual: <span className="font-bold text-primary">{usuario?.perfil}</span>
      </p>
    </div>
  );
}
