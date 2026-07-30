import React, { useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import {
  FormaPag,
  PagamentoItem,
  FORMAS_PAGAMENTO,
  calcularResumoPagamentos,
} from '@/utils/paymentCalculator';
import { PaymentHistory } from './PaymentHistory';
import { formatCurrency } from '@/utils/format';
import { vendasService } from '@/services/api';

interface ModalFinalizacaoPDVProps {
  open: boolean;
  onClose: () => void;
  totalVenda: number;
  pagamentos: PagamentoItem[];
  onAdicionarPagamento: (pagamento: PagamentoItem) => void;
  onRemoverPagamento: (index: number) => void;
  onConcluirVenda: () => void;
  isPendingFinalizar: boolean;
}

export const ModalFinalizacaoPDV: React.FC<ModalFinalizacaoPDVProps> = ({
  open,
  onClose,
  totalVenda,
  pagamentos,
  onAdicionarPagamento,
  onRemoverPagamento,
  onConcluirVenda,
  isPendingFinalizar,
}) => {
  const valorInputRef = useRef<HTMLInputElement>(null);

  // Etapa 1 = Informar valor, Etapa 2 = Selecionar forma de pagamento
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [valorInput, setValorInput] = useState<string>('');
  const [valorSelecionado, setValorSelecionado] = useState<number>(0);

  const resumo = calcularResumoPagamentos(totalVenda, pagamentos);

  // Ao abrir ou resetar para a Etapa 1: limpa valor e coloca foco no input
  const irParaEtapa1 = useCallback(() => {
    setEtapa(1);
    setValorInput('');
    setValorSelecionado(0);
    setTimeout(() => {
      if (valorInputRef.current) {
        valorInputRef.current.focus();
      }
    }, 50);
  }, []);

  useEffect(() => {
    if (open) {
      vendasService.auditoriaEvento('ABERTURA_TELA_FINALIZACAO', {
        total: totalVenda,
        totalPago: resumo.totalPago,
        falta: resumo.falta,
        pagamentosCount: pagamentos.length,
      });

      irParaEtapa1();
    }
  }, [open, irParaEtapa1]);

  // ETAPA 1: Confirmar valor informado (ou assumir saldo restante se vazio)
  const handleConfirmarValorEtapa1 = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    let valNumerico: number;

    if (!valorInput.trim()) {
      // Regra especial (PRD v2.0 Seção 5): se o campo estiver vazio, assume o valor integral restante
      valNumerico = resumo.falta;
    } else {
      valNumerico = parseFloat(valorInput.replace(',', '.'));
    }

    if (isNaN(valNumerico) || valNumerico <= 0) {
      toast.error('Informe um valor válido maior que zero.');
      return;
    }

    // Regra de Validação 9: Valor maior que o saldo restante não é permitido
    if (valNumerico > resumo.falta) {
      toast.error(`O valor não pode ser maior que o saldo restante (${formatCurrency(resumo.falta)}).`);
      return;
    }

    setValorSelecionado(valNumerico);
    setEtapa(2);
  };

  // ETAPA 2: Confirmar a forma de pagamento selecionada
  const handleSelecionarFormaEtapa2 = useCallback(
    (forma: FormaPag) => {
      if (valorSelecionado <= 0) {
        toast.error('Valor de pagamento inválido.');
        setEtapa(1);
        return;
      }

      onAdicionarPagamento({
        formaPagamento: forma,
        valor: valorSelecionado,
      });

      vendasService.auditoriaEvento('INCLUSAO_PAGAMENTO', {
        formaPagamento: forma,
        valor: valorSelecionado,
      });

      const novaFalta = Number(Math.max(0, resumo.falta - valorSelecionado).toFixed(2));

      if (novaFalta <= 0) {
        // Venda quitada: conclui
        onConcluirVenda();
      } else {
        // Ainda existe saldo pendente -> Volta para a ETAPA 1
        irParaEtapa1();
      }
    },
    [valorSelecionado, resumo.falta, onAdicionarPagamento, onConcluirVenda, irParaEtapa1]
  );

  // Manipulador global de atalhos de teclado no modal
  const handleKeyDownModal = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;

      if (etapa === 1) {
        // Na ETAPA 1: ESC cancela/fecha a finalização
        if (e.key === 'Escape') {
          e.preventDefault();
          vendasService.auditoriaEvento('FECHAMENTO_TELA_FINALIZACAO_ESC', {
            total: totalVenda,
            totalPago: resumo.totalPago,
            falta: resumo.falta,
          });
          onClose();
          return;
        }

        // Teclas F2 a F7 são bloqueadas na Etapa 1
        if (['F2', 'F3', 'F4', 'F5', 'F6', 'F7'].includes(e.key)) {
          e.preventDefault();
          return;
        }
      } else if (etapa === 2) {
        // Na ETAPA 2: ESC volta para a ETAPA 1 para corrigir valor
        if (e.key === 'Escape') {
          e.preventDefault();
          setEtapa(1);
          setTimeout(() => valorInputRef.current?.focus(), 50);
          return;
        }

        // Teclas 2 a 7 escolhem a forma de pagamento (PRD v2.0 Seção 6 e 10)
        const targetForma = FORMAS_PAGAMENTO.find((f) => f.tecla === e.key);
        if (targetForma) {
          e.preventDefault();
          handleSelecionarFormaEtapa2(targetForma.key);
          return;
        }
      }
    },
    [open, etapa, totalVenda, resumo.totalPago, resumo.falta, onClose, handleSelecionarFormaEtapa2]
  );

  useEffect(() => {
    if (open) {
      window.addEventListener('keydown', handleKeyDownModal);
      return () => window.removeEventListener('keydown', handleKeyDownModal);
    }
  }, [open, handleKeyDownModal]);

  return (
    <Modal
      open={open}
      onClose={() => {
        vendasService.auditoriaEvento('FECHAMENTO_TELA_FINALIZACAO_ESC', {
          total: totalVenda,
          totalPago: resumo.totalPago,
          falta: resumo.falta,
        });
        onClose();
      }}
      title="FINALIZAR VENDA"
      size="md"
    >
      <div className="flex flex-col gap-md">
        {/* ── Resumo Financeiro (PRD v2.0 Seção 11) ── */}
        <div className="bg-surface-container-low rounded-xl p-md border border-outline-variant font-mono space-y-2">
          <div className="flex justify-between items-center text-headline-sm font-bold text-on-surface">
            <span className="font-sans text-body-md font-bold uppercase tracking-wider text-on-surface-variant">TOTAL</span>
            <span className="text-display-sm text-on-surface font-black">{formatCurrency(resumo.total)}</span>
          </div>

          <div className="flex justify-between items-center text-headline-sm font-bold text-success">
            <span className="font-sans text-body-md font-bold uppercase tracking-wider">PAGO</span>
            <span className="text-display-sm font-black">{formatCurrency(resumo.totalPago)}</span>
          </div>

          <div
            className={`flex justify-between items-center text-headline-sm font-bold transition-colors ${
              resumo.falta === 0 ? 'text-success' : 'text-error'
            }`}
          >
            <span className="font-sans text-body-md font-bold uppercase tracking-wider">SALDO RESTANTE</span>
            <span className="text-display-sm font-black">{formatCurrency(resumo.falta)}</span>
          </div>

          {resumo.troco > 0 && (
            <div className="pt-2 border-t border-outline-variant flex justify-between items-center text-headline-sm font-bold text-success">
              <span className="font-sans text-body-md font-bold uppercase tracking-wider">TROCO (DINHEIRO)</span>
              <span className="text-display-sm font-black">{formatCurrency(resumo.troco)}</span>
            </div>
          )}
        </div>

        {/* ── Indicador de Etapas (PRD v2.0 Seção 4) ── */}
        <div className="flex items-center justify-between border-b border-outline-variant pb-xs text-body-sm font-bold">
          <span className={`flex items-center gap-1.5 ${etapa === 1 ? 'text-primary font-black' : 'text-on-surface-variant'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${etapa === 1 ? 'bg-primary text-on-primary' : 'bg-surface-container-high'}`}>1</span>
            Informar Valor
          </span>
          <span className="text-outline-variant">→</span>
          <span className={`flex items-center gap-1.5 ${etapa === 2 ? 'text-primary font-black' : 'text-on-surface-variant'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${etapa === 2 ? 'bg-primary text-on-primary' : 'bg-surface-container-high'}`}>2</span>
            Forma de Pagamento
          </span>
        </div>

        {/* ── CONTEÚDO DA ETAPA 1: Informar Valor (PRD v2.0 Seção 5) ── */}
        {etapa === 1 && (
          <form onSubmit={handleConfirmarValorEtapa1} className="space-y-md">
            <div className="space-y-xs">
              <div className="flex justify-between items-center">
                <label className="label font-bold text-body-md text-on-surface">Valor a pagar:</label>
                <span className="text-xs text-on-surface-variant font-mono">Deixe vazio para R$ {formatCurrency(resumo.falta)}</span>
              </div>

              <div className="relative">
                <input
                  ref={valorInputRef}
                  type="text"
                  value={valorInput}
                  onChange={(e) => setValorInput(e.target.value)}
                  placeholder={`R$ ${formatCurrency(resumo.falta)}`}
                  disabled={isPendingFinalizar}
                  className="input-lg text-center text-3xl font-black text-primary w-full h-14 pr-24"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isPendingFinalizar}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-on-primary px-3 py-1.5 rounded font-mono text-xs font-bold hover:brightness-110 active:scale-95 transition-all"
                >
                  [ENTER]
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center text-body-sm text-on-surface-variant font-medium pt-xs">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1 hover:text-error transition-colors"
              >
                <kbd className="px-2 py-0.5 text-xs font-mono bg-surface-container border border-outline-variant rounded">ESC</kbd>
                <span>Cancelar</span>
              </button>

              <button
                type="submit"
                disabled={isPendingFinalizar}
                className="btn-primary flex items-center gap-1.5 py-1.5 px-4 font-bold shadow-xs"
              >
                <span>Continuar</span>
                <kbd className="px-1.5 py-0.5 text-xs font-mono bg-white/20 rounded">ENTER</kbd>
              </button>
            </div>
          </form>
        )}

        {/* ── CONTEÚDO DA ETAPA 2: Selecionar Forma de Pagamento (PRD v2.0 Seção 6) ── */}
        {etapa === 2 && (
          <div className="space-y-md">
            {/* Destaque do Valor Selecionado */}
            <div className="bg-primary-container text-on-primary-container p-md rounded-xl flex items-center justify-between border border-primary/20 shadow-xs">
              <span className="font-bold text-body-md uppercase tracking-wider">VALOR SELECIONADO</span>
              <span className="text-headline-md font-black font-mono">{formatCurrency(valorSelecionado)}</span>
            </div>

            <div>
              <label className="label text-body-sm font-bold text-on-surface-variant mb-xs">
                Escolha a Forma de Pagamento (Pressione 2 a 7)
              </label>
              <div className="grid grid-cols-2 gap-sm">
                {FORMAS_PAGAMENTO.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    disabled={isPendingFinalizar}
                    onClick={() => handleSelecionarFormaEtapa2(f.key)}
                    className="flex items-center gap-3 p-md rounded-xl border-2 border-outline-variant bg-surface hover:border-primary hover:bg-primary/5 transition-all text-left group active:scale-98 disabled:opacity-50"
                  >
                    <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary font-mono font-black text-body-md flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-on-primary transition-colors">
                      {f.tecla}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-body-md text-on-surface group-hover:text-primary transition-colors truncate">
                        {f.shortLabel}
                      </div>
                      <div className="text-xs text-on-surface-variant truncate">Pressione [{f.tecla}]</div>
                    </div>
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary">
                      {f.icon}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center text-body-sm pt-xs">
              <button
                type="button"
                onClick={() => setEtapa(1)}
                className="inline-flex items-center gap-1 text-on-surface-variant hover:text-on-surface font-semibold transition-colors"
              >
                <kbd className="px-2 py-0.5 text-xs font-mono bg-surface-container border border-outline-variant rounded">ESC</kbd>
                <span>Voltar ao valor</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Histórico dos Pagamentos Realizados (PRD v2.0 Seção 11) ── */}
        <PaymentHistory
          pagamentos={pagamentos}
          totalPago={resumo.totalPago}
          onRemoverPagamento={(idx) => {
            const rem = pagamentos[idx];
            onRemoverPagamento(idx);
            vendasService.auditoriaEvento('EXCLUSAO_PAGAMENTO', {
              formaPagamento: rem?.formaPagamento,
              valor: rem?.valor,
            });
            irParaEtapa1();
          }}
        />
      </div>
    </Modal>
  );
};
