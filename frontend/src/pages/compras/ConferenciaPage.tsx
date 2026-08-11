import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { notasFiscaisService } from '@/services/api';
import { formatCurrency } from '@/utils/format';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConferenciaTable, { ConferenciaItem } from '@/components/compras/ConferenciaTable';
import IdentificarProdutoModal from '@/components/compras/IdentificarProdutoModal';
import VincularPedidoModal from '@/components/compras/VincularPedidoModal';
import NfeTimeline from '@/components/compras/NfeTimeline';
import NfeChaveField from '@/components/compras/NfeChaveField';
import ResolverDivergenciaModal from '@/components/compras/ResolverDivergenciaModal';

interface Props {
  notaFiscalId: string;
  onVoltar: () => void;
}

type Aba = 'conferencia' | 'eventos';

const SITUACAO_CFG: Record<string, { label: string; cls: string }> = {
  AUTORIZADA:   { label: 'Autorizada',   cls: 'text-green-700 bg-green-100' },
  CANCELADA:    { label: 'Cancelada',     cls: 'text-red-700 bg-red-100' },
  DENEGADA:     { label: 'Denegada',      cls: 'text-red-700 bg-red-100' },
  DESCONHECIDA: { label: 'Desconhecida',  cls: 'text-gray-600 bg-gray-100' },
};

export default function ConferenciaPage({ notaFiscalId, onVoltar }: Props) {
  const qc = useQueryClient();
  const [aba, setAba]                     = useState<Aba>('conferencia');
  const [itemIdentificar, setItemIdentificar] = useState<any>(null);
  const [modalVincular, setModalVincular]   = useState(false);
  const [divergenciaResolver, setDivergenciaResolver] = useState<any>(null);
  const [qtdsEditadas, setQtdsEditadas]     = useState<Record<string, number>>({});
  const [confirmando, setConfirmando]       = useState(false);
  const [observacao, setObservacao]         = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['conferencia', notaFiscalId],
    queryFn:  () => notasFiscaisService.getConferencia(notaFiscalId),
  });

  const receber = useMutation({
    mutationFn: () => {
      const itens = (conf.itens || [])
        .filter((i: ConferenciaItem) => i.nfeItemId && i.identificado && itensComQtd[i.nfeItemId!] > 0)
        .map((i: ConferenciaItem) => ({
          notaFiscalItemId: i.nfeItemId!,
          produtoId:        i.produtoId!,
          quantidade:       itensComQtd[i.nfeItemId!],
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

  if (isLoading) return <div className="flex justify-center py-24"><LoadingSpinner /></div>;
  const conf = data;
  if (!conf)   return null;

  const itensComQtd: Record<string, number> = {};
  (conf.itens || []).forEach((i: any) => {
    if (i.nfeItemId) itensComQtd[i.nfeItemId] = qtdsEditadas[i.nfeItemId] ?? i.quantidadeReceber;
  });

  const itensParaTabela: ConferenciaItem[] = (conf.itens || []).map((i: any) => ({
    ...i,
    quantidadeReceber: i.nfeItemId ? (itensComQtd[i.nfeItemId] ?? i.quantidadeReceber) : 0,
  }));

  const totalNfe      = itensParaTabela.reduce((a, i) => a + i.quantidadeNfe * i.valorUnitario, 0);
  const totalReceber  = itensParaTabela.reduce((a, i) => a + (itensComQtd[i.nfeItemId ?? ''] ?? 0) * i.valorUnitario, 0);
  const jaRecebida    = conf.notaFiscal.status === 'RECEBIDA';
  const podeConfirmar = !jaRecebida && conf.podeConfirmar;

  const situacao      = SITUACAO_CFG[conf.notaFiscal.situacaoFiscal ?? 'DESCONHECIDA'] ?? SITUACAO_CFG.DESCONHECIDA;

  return (
    <div className="space-y-4">

      {/* ── Cabeçalho ── */}
      <div>
        <button onClick={onVoltar} className="flex items-center gap-1 text-sm text-primary hover:underline mb-2">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Voltar para Notas Fiscais
        </button>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-on-surface">Conferência de NF-e</h2>
          {jaRecebida && (
            <span className="flex items-center gap-1 bg-green-50 border border-green-300 rounded-lg px-3 py-1.5 text-green-700 text-sm font-semibold">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              NF-e Recebida
            </span>
          )}
        </div>
      </div>

      {/* ── Dados da NF-e ── */}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="label">NF-e / Série</span>
            <p className="font-semibold text-data-mono">{conf.notaFiscal.numero} / {conf.notaFiscal.serie}</p>
          </div>
          <div>
            <span className="label">Fornecedor</span>
            <p className="font-semibold">{conf.notaFiscal.fornecedor?.nome || '—'}</p>
            {conf.notaFiscal.fornecedor?.cnpj && (
              <p className="text-xs text-on-surface-variant">{conf.notaFiscal.fornecedor.cnpj}</p>
            )}
          </div>
          <div>
            <span className="label">Situação Fiscal (SEFAZ)</span>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${situacao.cls}`}>
              {situacao.label}
            </span>
          </div>
          <div>
            <span className="label">Status Interno</span>
            <p className="text-sm font-semibold capitalize">
              {conf.notaFiscal.status.replace(/_/g, ' ').toLowerCase()}
            </p>
          </div>
        </div>

        {/* Chave de acesso */}
        <div>
          <span className="label">Chave de Acesso</span>
          <NfeChaveField chave={conf.notaFiscal.chaveAcesso} />
        </div>

        {/* Pedidos vinculados */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-on-surface-variant">Pedido(s) vinculado(s):</span>
            {conf.pedidosVinculados.length === 0 ? (
              <span className="text-sm text-on-surface-variant italic">Nenhum</span>
            ) : conf.pedidosVinculados.map((p: any) => (
              <span key={p.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                #{p.numero}
              </span>
            ))}
          </div>
          {!jaRecebida && (
            <button onClick={() => setModalVincular(true)}
              className="text-sm text-primary hover:text-primary/80 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">link</span>
              {conf.pedidosVinculados.length === 0 ? 'Vincular pedido' : 'Alterar vínculo'}
            </button>
          )}
        </div>
      </div>

      {/* ── Abas ── */}
      <div className="flex border-b border-outline-variant gap-1">
        {[
          { id: 'conferencia', label: 'Conferência', icon: 'fact_check' },
          { id: 'eventos',     label: 'Histórico de Eventos', icon: 'timeline' },
        ].map(({ id, label, icon }) => (
          <button key={id} onClick={() => setAba(id as Aba)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
              aba === id
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            <span className="material-symbols-outlined text-[17px]">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* ── Aba Conferência ── */}
      {aba === 'conferencia' && (
        <>
          {/* Contadores */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-3 flex items-center gap-3">
              <span className="material-symbols-outlined text-green-600 text-[24px]">check_circle</span>
              <div>
                <p className="text-2xl font-bold text-on-surface">{conf.identificados ?? 0}</p>
                <p className="text-xs text-on-surface-variant">Identificado(s)</p>
              </div>
            </div>
            <div className={`card p-3 flex items-center gap-3 ${conf.divergenciasAlerta > 0 ? 'border-amber-200 bg-amber-50/30' : ''}`}>
              <span className="material-symbols-outlined text-amber-600 text-[24px]">warning</span>
              <div>
                <p className="text-2xl font-bold text-on-surface">{conf.divergenciasAlerta ?? 0}</p>
                <p className="text-xs text-on-surface-variant">Alerta(s)</p>
              </div>
            </div>
            <div className={`card p-3 flex items-center gap-3 ${conf.divergenciasBloqueantes > 0 ? 'border-red-200 bg-red-50/30' : ''}`}>
              <span className="material-symbols-outlined text-red-600 text-[24px]">block</span>
              <div>
                <p className="text-2xl font-bold text-on-surface">{conf.divergenciasBloqueantes ?? 0}</p>
                <p className="text-xs text-on-surface-variant">Bloqueante(s)</p>
              </div>
            </div>
          </div>

          {/* Alerta NF-e denegada */}
          {conf.notaFiscal.situacaoFiscal === 'DENEGADA' && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-800">
              <span className="material-symbols-outlined text-red-600 shrink-0">gavel</span>
              <div>
                <strong>NF-e denegada pela SEFAZ.</strong> Esta nota não pode ser recebida.
                Entre em contato com o fornecedor para regularização.
              </div>
            </div>
          )}

          <ConferenciaTable
            itens={itensParaTabela}
            onChange={(id, qtd) => setQtdsEditadas((prev) => ({ ...prev, [id]: qtd }))}
            onIdentificar={!jaRecebida ? (item) => setItemIdentificar(item) : undefined}
            onResolverDivergencia={!jaRecebida ? (item) => setDivergenciaResolver({ id: item.divergenciaId, ...item }) : undefined}
            readonly={jaRecebida}
          />

          {/* ── Rodapé de totais e ação ── */}
          <div className="card p-4 bg-surface-container-low">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* Totais */}
              <div className="flex gap-6 text-sm">
                <div>
                  <p className="text-on-surface-variant text-xs">Total NF-e</p>
                  <p className="font-bold text-on-surface">{formatCurrency(totalNfe)}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant text-xs">Total a receber</p>
                  <p className="font-bold text-lg text-primary">{formatCurrency(totalReceber)}</p>
                </div>
              </div>

              {/* Ação */}
              {!jaRecebida && (
                <div className="flex items-center gap-3">
                  {conf.divergenciasAlerta > 0 && !confirmando && (
                    <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                      {conf.divergenciasAlerta} divergência(s) pendente(s) — revise ou prossiga
                    </span>
                  )}

                  {!confirmando ? (
                    <button
                      onClick={() => setConfirmando(true)}
                      disabled={!podeConfirmar}
                      title={!podeConfirmar
                        ? conf.divergenciasBloqueantes > 0
                          ? 'Resolva os itens bloqueantes antes de confirmar'
                          : 'Não há itens para receber'
                        : ''}
                      className="btn-success flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                      <span className="material-symbols-outlined text-[20px]">check_circle</span>
                      Confirmar Recebimento
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 bg-white border border-outline rounded-xl p-3">
                      <div>
                        <p className="text-sm font-semibold text-on-surface mb-1">Confirmar recebimento?</p>
                        <input value={observacao} onChange={(e) => setObservacao(e.target.value)}
                          className="input input-sm w-52" placeholder="Observação (opcional)" />
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
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Aba Eventos ── */}
      {aba === 'eventos' && (
        <div className="card p-4">
          <NfeTimeline nfeId={notaFiscalId} />
        </div>
      )}

      {/* ── Modais ── */}
      <IdentificarProdutoModal
        open={!!itemIdentificar} onClose={() => setItemIdentificar(null)}
        notaFiscalId={notaFiscalId} item={itemIdentificar}
        onSuccess={() => { refetch(); qc.invalidateQueries({ queryKey: ['nfe-eventos', notaFiscalId] }); }}
      />

      <VincularPedidoModal
        open={modalVincular} onClose={() => setModalVincular(false)}
        notaFiscalId={notaFiscalId} fornecedorId={conf.notaFiscal.fornecedor?.id ?? null}
        onSuccess={() => {
          setModalVincular(false);
          refetch();
          qc.invalidateQueries({ queryKey: ['nfe-eventos', notaFiscalId] });
        }}
      />

      {divergenciaResolver && (
        <ResolverDivergenciaModal
          open={!!divergenciaResolver} onClose={() => setDivergenciaResolver(null)}
          divergencia={divergenciaResolver}
          onSuccess={() => {
            setDivergenciaResolver(null);
            refetch();
            qc.invalidateQueries({ queryKey: ['nfe-eventos', notaFiscalId] });
          }}
        />
      )}
    </div>
  );
}
