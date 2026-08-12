import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { notasFiscaisService, fornecedoresService } from '@/services/api';
import { formatCurrency, formatDate, formatDateTime, formatCNPJ } from '@/utils/format';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ImportarXmlModal from '@/components/compras/ImportarXmlModal';
import VincularPedidoModal from '@/components/compras/VincularPedidoModal';
import NfeChaveField from '@/components/compras/NfeChaveField';
import ConferenciaPage from './ConferenciaPage';

// ── Configurações de status ───────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string; icon: string }> = {
  IMPORTADA:          { label: 'Importada',          cls: 'badge-neutral',                    icon: 'download'     },
  AGUARDANDO_VINCULO: { label: 'Ag. vínculo',        cls: 'bg-amber-100 text-amber-700',      icon: 'link_off'     },
  EM_CONFERENCIA:     { label: 'Em conferência',     cls: 'bg-blue-100 text-blue-700',        icon: 'fact_check'   },
  COM_DIVERGENCIA:    { label: 'Com divergência',    cls: 'bg-orange-100 text-orange-700',    icon: 'warning'      },
  APROVADA:           { label: 'Aprovada',           cls: 'bg-teal-100 text-teal-700',        icon: 'verified'     },
  RECEBIDA:           { label: 'Recebida',           cls: 'badge-success',                    icon: 'inventory'    },
  CANCELADA:          { label: 'Cancelada',          cls: 'badge-error',                      icon: 'cancel'       },
};

const SITUACAO_CFG: Record<string, { label: string; cls: string }> = {
  AUTORIZADA:   { label: 'Autorizada',  cls: 'text-green-700 bg-green-50 border-green-200'  },
  CANCELADA:    { label: 'Cancelada',   cls: 'text-red-700 bg-red-50 border-red-200'        },
  DENEGADA:     { label: 'Denegada',    cls: 'text-red-700 bg-red-50 border-red-200'        },
  DESCONHECIDA: { label: 'Desconhecida',cls: 'text-gray-600 bg-gray-50 border-gray-200'     },
};

// ── Filtros padrão ────────────────────────────────────────────────────────────

const FILTROS_VAZIOS = {
  numero:           '',
  chaveAcesso:      '',
  fornecedorId:     '',
  dataEmissaoInicio:'',
  dataEmissaoFim:   '',
  situacaoFiscal:   '',
  comPedido:        '',
};

// ── Componente ────────────────────────────────────────────────────────────────

export default function NotasFiscaisPage() {
  const qc = useQueryClient();

  // Navegação inline
  const [conferenciaId, setConferenciaId] = useState<string | null>(null);

  // Modais
  const [modalImportar, setModalImportar] = useState(false);
  const [vincularNf, setVincularNf]       = useState<any | null>(null);

  // Filtros
  const [page, setPage]                   = useState(1);
  const [filtroStatus, setFiltroStatus]   = useState('');
  const [filtros, setFiltros]             = useState({ ...FILTROS_VAZIOS });
  const [filtrosAtivos, setFiltrosAtivos] = useState({ ...FILTROS_VAZIOS });
  const [painelFiltros, setPainelFiltros] = useState(false);

  // Contagem de filtros não-vazios além do status
  const qtdFiltrosAtivos = Object.values(filtrosAtivos).filter(Boolean).length;

  const pesquisar = useCallback(() => {
    setFiltrosAtivos({ ...filtros });
    setPage(1);
  }, [filtros]);

  const limparFiltros = () => {
    setFiltros({ ...FILTROS_VAZIOS });
    setFiltrosAtivos({ ...FILTROS_VAZIOS });
    setFiltroStatus('');
    setPage(1);
  };

  // Query principal
  const { data, isLoading } = useQuery({
    queryKey: ['notas-fiscais', page, filtroStatus, filtrosAtivos],
    queryFn: () => notasFiscaisService.listar({
      page,
      limit: 20,
      ...(filtroStatus                        && { status:            filtroStatus }),
      ...(filtrosAtivos.numero                && { numero:            filtrosAtivos.numero }),
      ...(filtrosAtivos.chaveAcesso           && { chaveAcesso:       filtrosAtivos.chaveAcesso }),
      ...(filtrosAtivos.fornecedorId          && { fornecedorId:      filtrosAtivos.fornecedorId }),
      ...(filtrosAtivos.dataEmissaoInicio     && { dataEmissaoInicio: filtrosAtivos.dataEmissaoInicio }),
      ...(filtrosAtivos.dataEmissaoFim        && { dataEmissaoFim:    filtrosAtivos.dataEmissaoFim }),
      ...(filtrosAtivos.situacaoFiscal        && { situacaoFiscal:    filtrosAtivos.situacaoFiscal }),
      ...(filtrosAtivos.comPedido             && { comPedido:         filtrosAtivos.comPedido }),
    }),
    refetchInterval: 15_000,
  });

  // Lista de fornecedores para o select
  const { data: fornecedoresData } = useQuery({
    queryKey: ['fornecedores-lista'],
    queryFn: () => fornecedoresService.listar({ limit: 200 }),
    enabled: painelFiltros,
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => notasFiscaisService.cancelar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-fiscais'] });
      toast.success('NF-e cancelada');
    },
    onError: (e: any) => toast.error(e?.response?.data?.erro || 'Erro ao cancelar'),
  });

  // Busca direta por chave de acesso
  const buscarPorChave = async (chave: string) => {
    try {
      const nf = await notasFiscaisService.buscarPorChave(chave);
      setConferenciaId(nf.id);
    } catch (e: any) {
      const msg = e?.response?.status === 404
        ? 'NF-e não encontrada para esta chave de acesso'
        : e?.response?.data?.erro || 'Erro ao buscar';
      toast.error(msg);
    }
  };

  // ── Modo conferência inline ────────────────────────────────────────────────
  if (conferenciaId) {
    return (
      <ConferenciaPage
        notaFiscalId={conferenciaId}
        onVoltar={() => {
          setConferenciaId(null);
          qc.invalidateQueries({ queryKey: ['notas-fiscais'] });
        }}
      />
    );
  }

  const notas      = data?.data || [];
  const total      = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Notas Fiscais de Entrada</h2>
          <p className="text-sm text-on-surface-variant">{total} nota(s) encontrada(s)</p>
        </div>
        <button onClick={() => setModalImportar(true)} className="btn-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">upload_file</span>
          Importar NF-e (XML)
        </button>
      </div>

      {/* ── Busca por chave de acesso ── */}
      <div className="card p-4 space-y-2">
        <p className="text-xs font-bold uppercase text-on-surface-variant tracking-wider flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">qr_code</span>
          Busca por chave de acesso
        </p>
        <NfeChaveField editavel onBuscar={buscarPorChave} />
      </div>

      {/* ── Filtros de status (chips) ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {['', 'IMPORTADA', 'AGUARDANDO_VINCULO', 'EM_CONFERENCIA', 'COM_DIVERGENCIA', 'RECEBIDA', 'CANCELADA'].map((s) => (
          <button key={s} onClick={() => { setFiltroStatus(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
              filtroStatus === s
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-on-surface-variant border-outline hover:border-primary'}`}>
            {s === '' ? 'Todos' : STATUS_CFG[s]?.label ?? s}
          </button>
        ))}

        {/* Botão de filtros avançados */}
        <button
          onClick={() => setPainelFiltros((v) => !v)}
          className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
            painelFiltros || qtdFiltrosAtivos > 0
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-white border-outline text-on-surface-variant hover:border-primary'}`}>
          <span className="material-symbols-outlined text-[16px]">tune</span>
          Filtros avançados
          {qtdFiltrosAtivos > 0 && (
            <span className="bg-primary text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
              {qtdFiltrosAtivos}
            </span>
          )}
        </button>
      </div>

      {/* ── Painel de filtros avançados ── */}
      {painelFiltros && (
        <div className="card p-4 space-y-4 border-primary/30 border">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

            {/* Número NF-e */}
            <div>
              <label className="label">Número NF-e</label>
              <input
                type="text"
                value={filtros.numero}
                onChange={(e) => setFiltros((f) => ({ ...f, numero: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && pesquisar()}
                className="input"
                placeholder="Ex: 001234"
              />
            </div>

            {/* Fornecedor */}
            <div>
              <label className="label">Fornecedor</label>
              <select
                value={filtros.fornecedorId}
                onChange={(e) => setFiltros((f) => ({ ...f, fornecedorId: e.target.value }))}
                className="input"
              >
                <option value="">Todos os fornecedores</option>
                {(fornecedoresData?.data || []).map((f: any) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>

            {/* Situação fiscal */}
            <div>
              <label className="label">Situação Fiscal (SEFAZ)</label>
              <select
                value={filtros.situacaoFiscal}
                onChange={(e) => setFiltros((f) => ({ ...f, situacaoFiscal: e.target.value }))}
                className="input"
              >
                <option value="">Todas</option>
                <option value="AUTORIZADA">Autorizada</option>
                <option value="CANCELADA">Cancelada</option>
                <option value="DENEGADA">Denegada</option>
                <option value="DESCONHECIDA">Desconhecida</option>
              </select>
            </div>

            {/* Data de emissão — início */}
            <div>
              <label className="label">Emissão — de</label>
              <input
                type="date"
                value={filtros.dataEmissaoInicio}
                onChange={(e) => setFiltros((f) => ({ ...f, dataEmissaoInicio: e.target.value }))}
                className="input"
              />
            </div>

            {/* Data de emissão — fim */}
            <div>
              <label className="label">Emissão — até</label>
              <input
                type="date"
                value={filtros.dataEmissaoFim}
                onChange={(e) => setFiltros((f) => ({ ...f, dataEmissaoFim: e.target.value }))}
                className="input"
              />
            </div>

            {/* Vínculo com pedido */}
            <div>
              <label className="label">Pedido vinculado</label>
              <select
                value={filtros.comPedido}
                onChange={(e) => setFiltros((f) => ({ ...f, comPedido: e.target.value }))}
                className="input"
              >
                <option value="">Todas</option>
                <option value="true">Com pedido vinculado</option>
                <option value="false">Sem pedido vinculado</option>
              </select>
            </div>

          </div>

          {/* Chave de acesso parcial */}
          <div>
            <label className="label">Chave de acesso (parcial ou completa)</label>
            <input
              type="text"
              value={filtros.chaveAcesso}
              onChange={(e) => setFiltros((f) => ({ ...f, chaveAcesso: e.target.value.replace(/\D/g, '') }))}
              onKeyDown={(e) => e.key === 'Enter' && pesquisar()}
              className="input font-mono text-sm"
              placeholder="Digite parte ou toda a chave (apenas números)"
              maxLength={44}
            />
          </div>

          {/* Botões de ação dos filtros */}
          <div className="flex gap-3 justify-end border-t border-outline-variant pt-3">
            <button onClick={limparFiltros} className="btn-outline text-sm py-2 px-4 flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">clear_all</span>
              Limpar
            </button>
            <button onClick={pesquisar} className="btn-primary text-sm py-2 px-4 flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">search</span>
              Pesquisar
            </button>
          </div>
        </div>
      )}

      {/* ── Grid de NF-e ── */}
      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="th text-center w-8"></th>
                    <th className="th">NF-e / Chave</th>
                    <th className="th">Fornecedor / Emitente</th>
                    <th className="th text-center">CNPJ</th>
                    <th className="th">Emissão</th>
                    <th className="th text-right">Valor</th>
                    <th className="th text-center">Itens</th>
                    <th className="th text-center">Pedido</th>
                    <th className="th text-center">Fiscal</th>
                    <th className="th text-center">Status</th>
                    <th className="th w-36"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {notas.map((n: any) => {
                    const st          = STATUS_CFG[n.status] || { label: n.status, cls: 'badge-neutral', icon: 'info' };
                    const situal      = SITUACAO_CFG[n.situacaoFiscal ?? 'DESCONHECIDA'] ?? SITUACAO_CFG.DESCONHECIDA;
                    const podeConferir = ['AGUARDANDO_VINCULO', 'EM_CONFERENCIA', 'COM_DIVERGENCIA', 'IMPORTADA'].includes(n.status);
                    const temDiverg   = (n._count?.divergencias ?? 0) > 0;
                    const temPedido   = (n._count?.nfePedidos ?? 0) > 0;

                    return (
                      <tr key={n.id} className="tr-hover group">

                        {/* Ícone de status de conferência */}
                        <td className="td text-center px-2">
                          {n.status === 'RECEBIDA' ? (
                            <span className="material-symbols-outlined text-green-600 text-[18px]" title="Recebida">check_circle</span>
                          ) : temDiverg ? (
                            <span className="material-symbols-outlined text-amber-500 text-[18px]" title="Com divergências">warning</span>
                          ) : n.status === 'CANCELADA' ? (
                            <span className="material-symbols-outlined text-red-500 text-[18px]" title="Cancelada">cancel</span>
                          ) : (
                            <span className="material-symbols-outlined text-on-surface-variant text-[18px]" title={st.label}>{st.icon}</span>
                          )}
                        </td>

                        {/* NF-e número-série + chave truncada */}
                        <td className="td">
                          <p className="font-semibold text-data-mono text-on-surface">{n.numero}-{n.serie}</p>
                          <p className="text-[10px] text-on-surface-variant font-mono truncate max-w-[120px]" title={n.chaveAcesso}>
                            {n.chaveAcesso}
                          </p>
                        </td>

                        {/* Fornecedor */}
                        <td className="td text-sm max-w-[160px]">
                          <p className="truncate font-medium text-on-surface">{n.fornecedor?.nome || n.nomeEmitente || '—'}</p>
                          {!n.fornecedor?.nome && n.nomeEmitente && (
                            <p className="text-xs text-amber-600 truncate">Não cadastrado</p>
                          )}
                        </td>

                        {/* CNPJ */}
                        <td className="td text-center text-xs text-on-surface-variant font-mono whitespace-nowrap">
                          {n.fornecedor?.cnpj || n.cnpjEmitente
                            ? formatCNPJ(n.fornecedor?.cnpj || n.cnpjEmitente)
                            : '—'}
                        </td>

                        {/* Data emissão */}
                        <td className="td text-sm text-on-surface-variant whitespace-nowrap">
                          {n.dataEmissao ? formatDate(n.dataEmissao) : '—'}
                        </td>

                        {/* Valor */}
                        <td className="td text-right text-data-mono font-semibold whitespace-nowrap">
                          {formatCurrency(n.valorTotal)}
                        </td>

                        {/* Itens */}
                        <td className="td text-center text-sm">{n._count?.itens ?? '—'}</td>

                        {/* Pedido vinculado */}
                        <td className="td text-center">
                          {temPedido ? (
                            <span className="inline-flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                              <span className="material-symbols-outlined text-[12px]">link</span>
                              {n._count.nfePedidos}
                            </span>
                          ) : (
                            <span className="text-xs text-on-surface-variant">—</span>
                          )}
                        </td>

                        {/* Situação fiscal */}
                        <td className="td text-center">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${situal.cls}`}>
                            {situal.label}
                          </span>
                        </td>

                        {/* Status operacional */}
                        <td className="td text-center">
                          <span className={`badge ${st.cls}`}>{st.label}</span>
                        </td>

                        {/* Ações */}
                        <td className="td">
                          <div className="flex gap-1 items-center opacity-0 group-hover:opacity-100 transition-opacity">

                            {/* Conferir */}
                            {podeConferir && (
                              <button onClick={() => setConferenciaId(n.id)}
                                className="flex items-center gap-0.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-lg transition"
                                title="Conferir e receber">
                                <span className="material-symbols-outlined text-[14px]">fact_check</span>
                                Conferir
                              </button>
                            )}

                            {/* Vincular pedido */}
                            {!['RECEBIDA', 'CANCELADA'].includes(n.status) && (
                              <button
                                onClick={() => setVincularNf(n)}
                                className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition"
                                title="Vincular pedido">
                                <span className="material-symbols-outlined text-[18px]">link</span>
                              </button>
                            )}

                            {/* Download XML */}
                            {n.xmlPath && (
                              <a
                                href={notasFiscaisService.downloadXmlUrl(n.id)}
                                download
                                className="p-1 text-on-surface-variant hover:text-primary hover:bg-surface-container-low rounded transition"
                                title="Baixar XML">
                                <span className="material-symbols-outlined text-[18px]">download</span>
                              </a>
                            )}

                            {/* Cancelar */}
                            {!['RECEBIDA', 'CANCELADA'].includes(n.status) && (
                              <button
                                onClick={() => { if (confirm('Cancelar esta NF-e?')) cancelar.mutate(n.id); }}
                                className="p-1 text-error hover:bg-error-container rounded transition"
                                title="Cancelar NF-e">
                                <span className="material-symbols-outlined text-[18px]">cancel</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {notas.length === 0 && (
                    <tr>
                      <td colSpan={11} className="py-14 text-center">
                        <span className="material-symbols-outlined text-4xl block mb-2 text-on-surface-variant">receipt_long</span>
                        <p className="text-sm text-on-surface-variant">
                          {qtdFiltrosAtivos > 0 || filtroStatus
                            ? 'Nenhuma NF-e encontrada com os filtros aplicados.'
                            : 'Nenhuma NF-e importada. Clique em "Importar NF-e (XML)" para começar.'}
                        </p>
                        {(qtdFiltrosAtivos > 0 || filtroStatus) && (
                          <button onClick={limparFiltros} className="mt-3 text-sm text-primary hover:underline">
                            Limpar filtros
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="px-4 py-3 border-t border-outline-variant flex items-center justify-between bg-surface">
              <span className="text-sm text-on-surface-variant">
                {total > 0 ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, total)} de ${total}` : 'Sem resultados'}
              </span>
              <div className="flex gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1 rounded text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
                <span className="px-2 py-1 text-sm text-on-surface-variant">{page}/{totalPages || 1}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="p-1 rounded text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Modais ── */}
      <ImportarXmlModal
        open={modalImportar}
        onClose={() => setModalImportar(false)}
        onSuccess={(nf) => {
          setModalImportar(false);
          qc.invalidateQueries({ queryKey: ['notas-fiscais'] });
          setConferenciaId(nf.id);
        }}
      />

      {vincularNf && (
        <VincularPedidoModal
          open={!!vincularNf}
          onClose={() => setVincularNf(null)}
          notaFiscalId={vincularNf.id}
          fornecedorId={vincularNf.fornecedorId ?? null}
          onSuccess={() => {
            setVincularNf(null);
            qc.invalidateQueries({ queryKey: ['notas-fiscais'] });
          }}
        />
      )}
    </div>
  );
}
