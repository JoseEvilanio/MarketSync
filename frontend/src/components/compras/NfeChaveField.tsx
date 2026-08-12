import { useState } from 'react';
import toast from 'react-hot-toast';

interface Props {
  chave?: string;
  /** Se true, exibe como campo de busca editável */
  editavel?: boolean;
  onBuscar?: (chave: string) => void;
  onChange?: (chave: string) => void;
}

/** Formata a chave de acesso em grupos para legibilidade visual */
function formatarChave(chave: string): string {
  const s = chave.replace(/\D/g, '');
  // Grupos: 2+4+14+2+3+9+1+8+1 = 44
  const grupos = [2, 4, 14, 2, 3, 9, 1, 8, 1];
  let pos = 0;
  return grupos.map((g) => {
    const parte = s.slice(pos, pos + g);
    pos += g;
    return parte;
  }).filter(Boolean).join(' ');
}

function validarChave(chave: string): boolean {
  return chave.replace(/\D/g, '').length === 44;
}

export default function NfeChaveField({ chave, editavel = false, onBuscar, onChange }: Props) {
  const [valor, setValor] = useState('');

  function handleCopiar() {
    const texto = (chave ?? '').replace(/\D/g, '');
    navigator.clipboard.writeText(texto).then(
      () => toast.success('Chave copiada!'),
      () => toast.error('Falha ao copiar')
    );
  }

  if (!editavel) {
    // Modo exibição
    const valida = validarChave(chave ?? '');
    return (
      <div className="flex items-center gap-2">
        <span className={`font-mono text-xs break-all ${valida ? 'text-on-surface' : 'text-error'}`}>
          {chave ? formatarChave(chave) : '—'}
        </span>
        {chave && (
          <button type="button" onClick={handleCopiar}
            className="shrink-0 p-1 text-on-surface-variant hover:text-primary rounded transition"
            title="Copiar chave de acesso">
            <span className="material-symbols-outlined text-[16px]">content_copy</span>
          </button>
        )}
      </div>
    );
  }

  // Modo busca
  const valida = validarChave(valor);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const soNums = e.target.value.replace(/\D/g, '').slice(0, 44);
    setValor(soNums);
    onChange?.(soNums);
  }

  function handleBuscar() {
    if (!valida) { toast.error('Chave de acesso inválida — deve ter 44 dígitos'); return; }
    onBuscar?.(valor);
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={valor}
            onChange={handleChange}
            onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
            placeholder="Cole a chave de acesso de 44 dígitos..."
            maxLength={44}
            className={`input font-mono text-sm pr-16 ${valor && !valida ? 'border-error ring-1 ring-error' : ''}`}
          />
          <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${
            valor.length === 0 ? 'text-on-surface-variant' : valida ? 'text-green-600' : 'text-error'
          }`}>
            {valor.length}/44
          </span>
        </div>
        <button type="button" onClick={handleBuscar} disabled={!valida}
          className="btn-primary px-4 flex items-center gap-1 disabled:opacity-50">
          <span className="material-symbols-outlined text-[18px]">search</span>
          Buscar
        </button>
      </div>
      {valor && !valida && (
        <p className="text-xs text-error">A chave deve conter exatamente 44 dígitos numéricos</p>
      )}
      {valida && (
        <p className="text-xs text-on-surface-variant font-mono">{formatarChave(valor)}</p>
      )}
    </div>
  );
}
