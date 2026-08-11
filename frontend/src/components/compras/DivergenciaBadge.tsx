interface Props {
  tipo:          string;
  classificacao: 'BLOQUEANTE' | 'ALERTA' | null;
  /** Texto opcional — se omitido usa o label padrão do tipo */
  label?: string;
  size?: 'sm' | 'md';
}

const TIPO_INFO: Record<string, { label: string; icon: string }> = {
  QUANTIDADE_MENOR:         { label: 'Qtd menor',         icon: 'arrow_downward'   },
  QUANTIDADE_MAIOR:         { label: 'Qtd maior',         icon: 'arrow_upward'     },
  PRECO_DIFERENTE:          { label: 'Preço diferente',   icon: 'price_change'     },
  PRODUTO_NAO_SOLICITADO:   { label: 'Não solicitado',    icon: 'help'             },
  PRODUTO_NAO_IDENTIFICADO: { label: 'Não identificado',  icon: 'error'            },
  PRODUTO_FALTANTE:         { label: 'Faltante na NF-e',  icon: 'remove_shopping_cart' },
};

export default function DivergenciaBadge({ tipo, classificacao, label, size = 'sm' }: Props) {
  if (!tipo) return null;

  const info  = TIPO_INFO[tipo] ?? { label: tipo, icon: 'warning' };
  const texto = label ?? info.label;

  const corCls = classificacao === 'BLOQUEANTE'
    ? 'bg-red-100 text-red-700 border-red-200'
    : 'bg-amber-100 text-amber-700 border-amber-200';

  const iconSz = size === 'sm' ? 'text-[12px]' : 'text-[14px]';
  const txtSz  = size === 'sm' ? 'text-[11px]' : 'text-xs';

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border font-semibold ${corCls} ${txtSz}`}
      title={classificacao === 'BLOQUEANTE' ? 'Bloqueante — impede recebimento' : 'Alerta — pode ser autorizado'}
    >
      <span className={`material-symbols-outlined ${iconSz}`}>{info.icon}</span>
      {texto}
    </span>
  );
}
