import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import { recebimentosService } from '@/services/api';
import { formatCurrency } from '@/utils/format';

interface Divergencia {
  id: string;
  tipo: string;
  descricaoItem?: string;
  quantidadePedida?: number;
  quantidadeNfe?: number;
  precoPedido?: number;
  precoNfe?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  divergencia: Divergencia | null;
  onSuccess: () => void;
}

type Opcao = 'aceitar_nfe' | 'aceitar_pedido' | 'nao_receber' | 'manual' | 'ignorar';

const TIPO_LABEL: Record<string, string> = {
  QUANTIDADE_MENOR:         'Quantidade menor que o pedido',
  QUANTIDADE_MAIOR:         'Quantidade maior que o pedido',
  PRECO_DIFERENTE:          'Preço diferente do pedido',
  PRODUTO_NAO_SOLICITADO:   'Produto não consta no pedido',
  PRODUTO_NAO_IDENTIFICADO: 'Produto não identificado',
};

export default function ResolverDivergenciaModal({ open, onClose, divergencia, onSuccess }: Props) {
  const qc = useQueryClient();
  const [opcao, setOpcao]         = useState<Opcao>('aceitar_nfe');
  const [qtdManual, setQtdManual] = useState('');
  const [observacao, setObservacao] = useState('');

  function calcularQtdAceita(): number | undefined {
    if (opcao === 'aceitar_nfe')    return divergencia?.quantidadeNfe;
    if (opcao === 'aceitar_pedido') return divergencia?.quantidadePedida;
    if (opcao === 'nao_receber')    return 0;
    if (opcao === 'manual')         return parseFloat(qtdManual) || 0;
    return undefined; // ignorar
  }

  const { mutate: resolver, isPending } = useMutation({
    mutationFn: () => recebimentosService.resolverDivergencia(divergencia!.id, {
      quantidadeAceita: calcularQtdAceita(),
      observacao,
      ignorar: opcao === 'ignorar',
    }),
    onSuccess: () => {
      toast.success('Divergência resolvida');
      qc.invalidateQueries({ queryKey: ['divergencias'] });
      setOpcao('aceitar_nfe'); setQtdManual(''); setObservacao('');
      onSuccess();
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.erro || 'Erro ao resolver divergência'),
  });

  function handleClose() {
    if (isPending) return;
    setOpcao('aceitar_nfe'); setQtdManual(''); setObservacao(''); onClose();
  }

  if (!divergencia) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Resolver Divergência" size="md">
      <div className="space-y-4">

        {/* Tipo e detalhes */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
          <p className="text-sm font-bold text-amber-700">
            {TIPO_LABEL[divergencia.tipo] ?? divergencia.tipo}
          </p>
          {divergencia.descricaoItem && (
            <p className="text-sm text-on-surface">{divergencia.descricaoItem}</p>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {divergencia.quantidadePedida !== undefined && (
              <div>
                <p className="text-on-surface-variant">Qtd. Pedida</p>
                <p className="font-bold text-on-surface">{divergencia.quantidadePedida}</p>
              </div>
            )}
            {divergencia.quantidadeNfe !== undefined && (
              <div>
                <p className="text-on-surface-variant">Qtd. NF-e</p>
                <p className="font-bold text-on-surface">{divergencia.quantidadeNfe}</p>
              </div>
            )}
            {divergencia.precoPedido !== undefined && (
              <div>
                <p className="text-on-surface-variant">Preço Pedido</p>
                <p className="font-bold text-on-surface">{formatCurrency(divergencia.precoPedido)}</p>
              </div>
            )}
            {divergencia.precoNfe !== undefined && (
              <div>
                <p className="text-on-surface-variant">Preço NF-e</p>
                <p className="font-bold text-on-surface">{formatCurrency(divergencia.precoNfe)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Opções */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-on-surface">Decisão</p>
          {[
            { val: 'aceitar_nfe',    label: `Receber quantidade da NF-e (${divergencia.quantidadeNfe ?? '—'})` },
            { val: 'aceitar_pedido', label: `Receber quantidade do pedido (${divergencia.quantidadePedida ?? '—'})` },
            { val: 'nao_receber',    label: 'Não receber este item' },
            { val: 'manual',         label: 'Informar quantidade manualmente' },
            { val: 'ignorar',        label: 'Ignorar divergência (manter como está)' },
          ].map(({ val, label }) => (
            <label key={val} className="flex items-center gap-2 cursor-pointer text-sm text-on-surface">
              <input type="radio" name="opcao" value={val}
                checked={opcao === val} onChange={() => setOpcao(val as Opcao)}
                className="text-primary" />
              {label}
            </label>
          ))}
        </div>

        {/* Quantidade manual */}
        {opcao === 'manual' && (
          <div>
            <label className="label">Quantidade a receber</label>
            <input type="number" min={0} step={0.001} value={qtdManual}
              onChange={(e) => setQtdManual(e.target.value)}
              className="input w-40" placeholder="0" />
          </div>
        )}

        {/* Observação */}
        <div>
          <label className="label">Justificativa <span className="text-error">*</span></label>
          <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)}
            className="input min-h-[72px] resize-none"
            placeholder="Descreva o motivo da decisão..." rows={3} />
        </div>

        {/* Botões */}
        <div className="flex justify-end gap-3 border-t border-outline-variant pt-4">
          <button type="button" onClick={handleClose} disabled={isPending} className="btn-outline">Cancelar</button>
          <button type="button" onClick={() => resolver()}
            disabled={isPending || !observacao.trim() || (opcao === 'manual' && !qtdManual)}
            className="btn-primary flex items-center gap-2">
            {isPending
              ? <><span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>Salvando...</>
              : <><span className="material-symbols-outlined text-[18px]">check_circle</span>Confirmar Decisão</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
