import React from 'react';
import { PagamentoItem, FORMAS_PAGAMENTO } from '@/utils/paymentCalculator';
import { formatCurrency } from '@/utils/format';

interface PaymentHistoryProps {
  pagamentos: PagamentoItem[];
  totalPago: number;
  onRemoverPagamento: (index: number) => void;
}

export const PaymentHistory: React.FC<PaymentHistoryProps> = ({
  pagamentos,
  totalPago,
  onRemoverPagamento,
}) => {
  if (pagamentos.length === 0) {
    return (
      <div className="mt-md p-md bg-surface-container-lowest rounded-lg border border-dashed border-outline-variant text-center">
        <p className="text-body-sm text-on-surface-variant font-medium">Nenhum pagamento registrado</p>
      </div>
    );
  }

  return (
    <div className="mt-md space-y-2">
      <div className="flex justify-between items-center text-label-md font-bold text-on-surface-variant uppercase tracking-wider">
        <span>Pagamentos</span>
        <span>{pagamentos.length} registro(s)</span>
      </div>

      <div className="bg-surface-container-lowest rounded-lg p-md border border-outline-variant font-mono text-body-md space-y-1.5 max-h-44 overflow-y-auto">
        {pagamentos.map((p, idx) => {
          const formaOpt = FORMAS_PAGAMENTO.find((f) => f.key === p.formaPagamento);
          const shortLabel = formaOpt?.shortLabel || p.formaPagamento;

          return (
            <div key={idx} className="flex items-center justify-between group hover:bg-surface-container-low px-1 py-0.5 rounded transition-colors">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">
                  {formaOpt?.icon || 'payments'}
                </span>
                <span className="font-semibold text-on-surface truncate">{shortLabel}</span>
                <span className="text-outline-variant text-xs flex-1 border-b border-dotted border-outline-variant/60 mx-1 -translate-y-1"></span>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="font-bold text-on-surface text-data-mono">{formatCurrency(p.valor)}</span>
                <button
                  type="button"
                  onClick={() => onRemoverPagamento(idx)}
                  className="text-error/70 hover:text-error hover:bg-error-container/30 p-0.5 rounded transition-colors"
                  title="Remover pagamento"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            </div>
          );
        })}

        <div className="pt-2 border-t border-outline-variant flex justify-between items-center font-bold text-headline-sm text-success">
          <span className="uppercase text-xs tracking-wider font-sans font-bold">Pago</span>
          <span className="text-data-mono font-black">{formatCurrency(totalPago)}</span>
        </div>
      </div>
    </div>
  );
};
