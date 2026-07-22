import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  title: string;
  showPDVButton?: boolean;
}

export default function TopNav({ title, showPDVButton = true }: Props) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  return (
    <header className="bg-surface border-b border-outline-variant w-full px-lg h-16 flex justify-between items-center z-40 shrink-0 shadow-sm">
      <div className="flex items-center gap-lg">
        <h2 className="text-headline-md font-semibold text-primary">{title}</h2>
        <div className="relative hidden md:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
            search
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="pl-9 pr-4 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-56 transition-colors"
          />
        </div>
      </div>
      <div className="flex items-center gap-sm">
        {showPDVButton && (
          <button
            onClick={() => navigate('/pdv')}
            className="flex items-center gap-1 px-3 py-1.5 bg-success text-white rounded-lg text-label-md font-bold hover:brightness-90 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
            Abrir PDV
          </button>
        )}
        <button className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <button
          onClick={() => navigate('/configuracoes')}
          className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors"
          title="Configurações"
        >
          <span className="material-symbols-outlined">settings</span>
        </button>
      </div>
    </header>
  );
}
