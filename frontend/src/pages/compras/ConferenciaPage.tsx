import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { notasFiscaisService } from '@/services/api';
import { formatCurrency } from '@/utils/format';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConferenciaTable, { ConferenciaItem } from '@/components/compras/ConferenciaTable';
import IdentificarProdutoModal from '@/components/compras/IdentificarProdutoModal';
import VincularPedidoModal from '@/components/compras/VincularPedidoModal';

interface Props {
  notaFiscalId: string;
  onVoltar: () => void;
}

export default function ConferenciaPage({ notaFiscalId, onVoltar }: Props) {
  const qc = useQueryClient();
  const [itemIdentificar, setItemIdentificar] = useState<any>(null);
  const [modalVincular, setModalVincular]     = useState(false);
  const [qtdsEditadas, setQtdsEditadas]       = useState<Record<string, number>>({});
  const [confirmando, setConfirmando]         = useState(false);
  const [observacao, setObservacao]           = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['conferencia', notaFiscalId],
    queryFn: () => notasFiscaisService.getConferencia(notaFiscalId),
  });

  const receber = useMutation({
    mutationFn: () => {
      const itens = (data?.itens || [])
        .filter((i: ConferenciaItem) => i.identificado && itensComQtd[i.nfeItemId] > 0)
        .map((i: ConferenciaItem) => ({
          notaFiscalItemId: i.nfeItemId,
          produtoId:        i.produtoId!,
          quantidade:       itensComQtd[i.nfeItemId],
          valorUnitario:    i.valorUnitario,
        }));
      return notasFiscaisService.receber(notaFiscalId, { itens, observacao: observacao || undefined });
    },
    onSuccess: () => {
      toast.success('Recebimento confirmado! Estoque atualizado.');
      qc.invalidateQueries({ queryKey: ['notas-fiscais'] });
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['produtos'] });
      setConfirmando(false);
      onVoltar();
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.erro || 'Erro ao confirmar recebimento');
      setConfirmando(false);
    },
  });

  if (isLoading) return (
    <div className="flex justify-center items-center py-24">
      <LoadingSpinner />
    </div>
  );

  const conf = data;
  if (!conf) return null;

  // Mesclar quantidades editadas com as da conferência
  const itensComQtd: Record<string, number> = {};
  (conf.itens || []).forEach((i: ConferenciaItem) => {
    itensComQtd[i.nfeItemId] = qtdsEditadas[i.nfeItemId] ?? i.quantidadeReceber;
  });

  const itensParaTabela: ConferenciaItem[] = (conf.itens || []).map((i: ConferenciaItem) => ({
    ...i,
    quantidadeReceber: itensComQtd[i.nfeItemId],
  }));

  const totalReceber = itensParaTabela.reduce((a, i) => a + itensComQtd[i.nfeItemId] * i.valorUnitario, 0);
  const podeConfirmar = conf.podeConfirmar && itensParaTabela.some((i) => i.identificado && itensComQtd[i.nfeItemId] > 0);
  const jaRecebida    = conf.notaFiscal.status === 'RECEBIDA';

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={onVoltar} className="flex items-center gap-1 text-sm text-primary hover:underline mb-2">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Voltar para Notas Fiscais
          </button>
          <h2 className="text-xl font-bold text-on-surface">Conferência de NF-e</h2>
        </div>
        {jaRecebida && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-300 rounded-lg px-4 py-2 text-green-700 text-sm font-semibold">
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            NF-e já recebida
          </div>
        )}
      </div>

      {/* Dados da NF-e */}
      <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><span className="label">NF-e</span><p className="font-semibold">{conf.notaFiscal.numero}-{conf.notaFiscal.serie}</p></div>
        <div><span className="label">Fornecedor</span><p>{conf.notaFiscal.fornecedor?.nome || '—'}</p></div>
        <div><span className="label">Chave de Acesso</span><p className="font-mono text-xs truncate">{conf.notaFiscal.chaveAcesso}</p></div>
        <div><span className="label">Status</span>
          <p className="font-semibold capitalize">{conf.notaFiscal.status.replace(/_/g, ' ').toLowerCase()}</p>
        </div>
      </div>

      {/* Pedidos vinculados + botão vincular */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-on-surface-variant">Pedidos vinculados:</span>
          {conf.pedidosVinculados.length === 0 ? (
            <span className="text-sm text-on-surface-variant italic">Nenhum</span>
          ) : conf.pedidosVinculados.map((p: any) => (
            <span key={p.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">#{p.numero}</span>
          ))}
        </div>
        {!jaRecebida && (
          <button onClick={() => setModalVincular(true)}
            className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-semibold">
            <span className="material-symbols-outlined text-[18px]">link</span>
            {conf.pedidosVinculados.length === 0 ? 'Vincular pedido' : 'Alterar vínculo'}
          </button>
        )}
      </div>

      {/* Tabela de conferência */}
      <ConferenciaTable
        itens={itensParaTabela}
        onChange={(id, qtd) => setQtdsEditadas((prev) => ({ ...prev, [id]: qtd }))}
        onIdentificar={!jaRecebida ? (item) => setItemIdentificar(item) : undefined}
        readonly={jaRecebida}
      />

      {/* Rodapé de ação */}
      {!jaRecebida && (
        <div className="card p-4 flex items-center justify-between gap-4 bg-surface-container-low">
          <div className="text-sm text-on-surface-variant">
            <strong className="text-on-surface">{conf.totalItens}</strong> item(s) ·
            {conf.naoIdentificados > 0 && <span className="text-red-600 font-semibold ml-1">{conf.naoIdentificados} não identificado(s)</span>}
            {conf.totalDivergencias > 0 && <span className="text-amber-600 font-semibold ml-1">· {conf.totalDivergencias} divergência(s)</span>}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-on-surface-variant">Total a receber</p>
              <p className="font-bold text-lg text-on-surface">{formatCurrency(totalReceber)}</p>
            </div>

            {!confirmando ? (
              <button onClick={() => setConfirmando(true)}
                disabled={!podeConfirmar}
                className="btn-success flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title={!podeConfirmar ? 'Identifique todos os produtos antes de confirmar' : ''}>
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
                Confirmar Recebimento
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-white border border-outline rounded-xl p-3">
                <div>
                  <p className="text-sm font-semibold text-on-surface mb-1">Confirmar recebimento?</p>
                  <input value={observacao} onChange={(e) => setObservacao(e.target.value)}
                    className="input input-sm w-56" placeholder="Observação (opcional)" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmando(false)} className="btn-outline text-sm py-1.5 px-3">Cancelar</button>
                  <button onClick={() => receber.mutate()} disabled={receber.isPending}
                    className="btn-success text-sm py-1.5 px-3 flex items-center gap-1">
                    {receber.isPending
                      ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Processando...</>
                      : <><span className="material-symbols-outlined text-[16px]">check</span>Confirmar</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modais */}
      <IdentificarProdutoModal open={!!itemIdentificar} onClose={() => setItemIdentificar(null)}
        notaFiscalId={notaFiscalId} item={itemIdentificar}
        onSuccess={() => refetch()} />

      <VincularPedidoModal open={modalVincular} onClose={() => setModalVincular(false)}
        notaFiscalId={notaFiscalId} fornecedorId={conf.notaFiscal.fornecedor?.id ?? null}
        onSuccess={() => { setModalVincular(false); refetch(); }} />
    </div>
  );
}
