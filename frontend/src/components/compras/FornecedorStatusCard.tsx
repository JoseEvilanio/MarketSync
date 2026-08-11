import { formatCurrency } from '@/utils/format';

interface Props {
  identificado:  boolean;
  fornecedor?:   { nome: string; cnpj: string } | null;
  cnpjEmitente?: string;
  nomeEmitente?: string;
  /** Chamado quando o usuário clica em "Cadastrar/Vincular fornecedor" */
  onCadastrar?: () => void;
}

export default function FornecedorStatusCard({
  identificado, fornecedor, cnpjEmitente, nomeEmitente, onCadastrar,
}: Props) {
  if (identificado && fornecedor) {
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
        <span className="material-symbols-outlined text-green-600 text-[22px]">store</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-on-surface truncate">{fornecedor.nome}</p>
          <p className="text-xs text-on-surface-variant">CNPJ: {fornecedor.cnpj}</p>
        </div>
        <span className="text-xs font-bold text-green-700 bg-green-200/80 px-2 py-0.5 rounded-full flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">check_circle</span>
          Identificado
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
      <span className="material-symbols-outlined text-amber-600 text-[22px] shrink-0">store_off</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800">Fornecedor não cadastrado</p>
        {nomeEmitente && <p className="text-xs text-on-surface">{nomeEmitente}</p>}
        {cnpjEmitente && (
          <p className="text-xs text-on-surface-variant">CNPJ do emitente: <span className="font-mono">{cnpjEmitente}</span></p>
        )}
        <p className="text-xs text-amber-700 mt-1">
          O CNPJ não está no cadastro de fornecedores. Você pode continuar sem vincular ou cadastrar agora.
        </p>
      </div>
      {onCadastrar && (
        <button type="button" onClick={onCadastrar}
          className="shrink-0 text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-lg transition">
          Cadastrar
        </button>
      )}
    </div>
  );
}
