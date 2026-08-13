import { useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import { formatCurrency } from '@/utils/format';

interface ModalConfirmarCancelamentoPDVProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  tipo: 'ITEM' | 'VENDA';
  itemInfo?: {
    nome: string;
    quantidade: number;
    subtotal: number;
    unidade?: string;
  } | null;
  vendaInfo?: {
    totalItens: number;
    totalValor: number;
  } | null;
}

export function ModalConfirmarCancelamentoPDV({
  open,
  onClose,
  onConfirm,
  tipo,
  itemInfo,
  vendaInfo,
}: ModalConfirmarCancelamentoPDVProps) {

  // Escutar teclas ENTER para confirmar e ESC para cancelar
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onConfirm, onClose]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tipo === 'ITEM' ? 'Remover Item da Venda' : '⚠️ CANCELAR VENDA EM ANDAMENTO'}
      size="sm"
    >
      <div className="space-y-4 pt-1">
        {tipo === 'ITEM' && itemInfo && (
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-error">
              Item Selecionado para Remoção
            </p>
            <p className="text-lg font-extrabold text-on-surface leading-snug">
              {itemInfo.nome}
            </p>
            <div className="flex justify-between items-end border-t border-outline-variant/60 pt-2 text-sm">
              <span className="text-on-surface-variant font-mono">
                Qtd / Peso: <strong>{itemInfo.quantidade} {itemInfo.unidade || ''}</strong>
              </span>
              <span className="text-lg font-bold text-on-surface font-mono">
                {formatCurrency(itemInfo.subtotal)}
              </span>
            </div>
          </div>
        )}

        {tipo === 'VENDA' && vendaInfo && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-2 text-red-900">
            <div className="flex items-center gap-2 font-bold text-base">
              <span className="material-symbols-outlined text-red-600 text-[24px]">warning</span>
              <span>Deseja realmente cancelar toda a venda?</span>
            </div>
            <p className="text-xs text-red-800 leading-relaxed">
              Todos os <strong>{vendaInfo.totalItens} item(s)</strong> no valor total de{' '}
              <strong>{formatCurrency(vendaInfo.totalValor)}</strong> serão removidos do carrinho atual.
            </p>
          </div>
        )}

        <div className="flex justify-between items-center border-t border-outline-variant pt-4">
          <div className="text-xs text-on-surface-variant font-medium">
            Pressione <kbd className="px-1.5 py-0.5 bg-surface-container-high border rounded text-[11px]">ESC</kbd> para Voltar
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-outline text-xs px-3 py-1.5"
            >
              [ESC] Voltar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`text-xs px-4 py-1.5 font-bold rounded-lg transition shadow-sm flex items-center gap-1.5 text-white ${
                tipo === 'ITEM' ? 'bg-error hover:bg-error/90' : 'bg-red-700 hover:bg-red-800'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              [ENTER] Confirmar {tipo === 'ITEM' ? 'Remoção' : 'Cancelamento'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
