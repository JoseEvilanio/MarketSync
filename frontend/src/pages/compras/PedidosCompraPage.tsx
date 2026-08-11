import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { pedidosService, fornecedoresService, produtosService } from '@/services/api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ImportarXmlModal from '@/components/compras/ImportarXmlModal';
import ConferenciaPage from './ConferenciaPage';

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  RASCUNHO:       { label: 'Rascunho',        cls: 'badge-neutral' },
  ABERTO:         { label: 'Aberto',           cls: 'bg-blue-100 text-blue-700' },
  ENVIADO:        { label: 'Enviado',          cls: 'bg-indigo-100 text-indigo-700' },
  FATURADO:       { label: 'Faturado',         cls: 'bg-purple-100 text-purple-700' },
  EM_CONFERENCIA: { label: 'Em conferência',   cls: 'bg-amber-100 text-amber-700' },
  PARCIAL:        { label: 'Parcial',          cls: 'bg-orange-100 text-orange-700' },
  RECEBIDO:       { label: 'Recebido',         cls: 'badge-success' },
  CONCLUIDO:      { label: 'Concluído',        cls: 'badge-success' },
  CANCELADO:      { label: 'Cancelado',        cls: 'badge-error' },
  DIVERGENTE:     { label: 'Divergente',       cls: 'bg-red-100 text-red-700' },
};

interface ItemForm { produtoId: string; produtoNome: string; quantidade: number; precoUnitario: number; }

export default function PedidosCompraPage() {
  const qc = useQueryClient();
  const [page, setPage]     = useState(1);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [modalNovo, setModalNovo]   = useState(false);
  const [modalDetalhe, setModalDetalhe] = useState<any>(null);
  const [importarParaPedido, setImportarParaPedido] = useState<any>(null);
  const [conferenciaId, setConferenciaId] = useState<string | null>(null);

  // Form
  const [fornecedorId, setFornecedorId] = useState('');
  const [observacao, setObservacao]     = useState('');
  const [itens, setItens]               = useState<ItemForm[]>([]);
  const [buscaProd, setBuscaProd]       = useState('');
  const [qtd, setQtd]                   = useState('1');
  const [preco, setPreco]               = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pedidos', page, filtroStatus],
    queryFn: () => pedidosService.listar({ page, limit: 20, ...(filtroStatus && { status: filtroStatus }) }),
  });

  const { data: fornecedores } = useQuery({
    queryKey: ['fornecedores-lista'],
    queryFn: () => fornecedoresService.listar({ limit: 200 }),
  });

  const buscarProd = useMutation({
    mutationFn: (c: string) => produtosService.buscarBarras(c),
    onSuccess: (prod) => {
      setItens((prev) => [...prev, {
        produtoId:    prod.id, produtoNome: prod.nome,
        quantidade:   Number(qtd) || 1,
        precoUnitario: Number(preco) || Number(prod.precoCompra),
      }]);
      setBuscaProd(''); setQtd('1'); setPreco('');
    },
    onError: () => toast.error('Produto não encontrado'),
  });

  const criar = useMutation({
    mutationFn: () => pedidosService.criar({
      fornecedorId: fornecedorId || undefined,
      observacao:   observacao || undefined,
      itens: itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, precoUnitario: i.precoUnitario })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      toast.success('Pedido criado como rascunho!');
      setModalNovo(false); resetForm();
    },
    onError: (e: any) => toast.error(e?.response?.data?.erro || 'Erro ao criar pedido'),
  });

  const abrir = useMutation({
    mutationFn: (id: string) => pedidosService.abrir(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedidos'] }); toast.success('Pedido aberto'); setModalDetalhe(null); },
  });

  const enviar = useMutation({
    mutationFn: (id: string) => pedidosService.enviar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedidos'] }); toast.success('Pedido enviado ao fornecedor'); setModalDetalhe(null); },
  });

  const faturar = useMutation({
    mutationFn: (id: string) => pedidosService.faturar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedidos'] }); toast.success('Pedido marcado como faturado'); setModalDetalhe(null); },
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => pedidosService.cancelar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedidos'] }); toast.success('Pedido cancelado'); setModalDetalhe(null); },
  });

  function resetForm() { setFornecedorId(''); setObservacao(''); setItens([]); setBuscaProd(''); setQtd('1'); setPreco(''); }

  const pedidos = data?.data || [];
  const total   = data?.total || 0;
  const totalPages = Math.ceil(total / 20);
  const subtotal   = itens.reduce((a, i) => a + i.quantidade * i.precoUnitario, 0);

  return (
    <div className="space-y-4">

      {/* Modo conferência — renderiza ConferenciaPage inline */}
      {conferenciaId && (
        <ConferenciaPage
          notaFiscalId={conferenciaId}
          onVoltar={() => { setConferenciaId(null); qc.invalidateQueries({ queryKey: ['pedidos'] }); }}
        />
      )}

      {conferenciaId ? null : (<>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Pedidos de Compra</h2>
          <p className="text-sm text-on-surface-variant">{total} pedido(s)</p>
        </div>
        <button onClick={() => setModalNovo(true)} className="btn-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
          Novo Pedido
        </button>
      </div>

      {/* Filtro */}
      <div className="flex gap-2 flex-wrap">
        {['', 'RASCUNHO', 'ABERTO', 'ENVIADO', 'EM_CONFERENCIA', 'PARCIAL', 'RECEBIDO', 'CANCELADO'].map((s) => (
          <button key={s} onClick={() => { setFiltroStatus(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
              filtroStatus === s ? 'bg-primary text-white border-primary' : 'bg-white text-on-surface-variant border-outline hover:border-primary'}`}>
            {s === '' ? 'Todos' : STATUS_CFG[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner /> : (
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="th">#</th><th className="th">Fornecedor</th>
                <th className="th text-right">Total</th><th className="th text-center">Status</th>
                <th className="th">Data</th><th className="th w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {pedidos.map((p: any) => {
                const st = STATUS_CFG[p.status] || { label: p.status, cls: 'badge-neutral' };
                return (
                  <tr key={p.id} className="tr-hover group">
                    <td className="td font-bold text-data-mono">{p.numero}</td>
                    <td className="td text-body-sm">{p.fornecedor?.nome || 'Sem fornecedor'}</td>
                    <td className="td text-right text-data-mono font-semibold">{formatCurrency(p.total)}</td>
                    <td className="td text-center"><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    <td className="td text-body-sm text-on-surface-variant">{formatDateTime(p.createdAt)}</td>
                    <td className="td">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={async () => setModalDetalhe(await pedidosService.buscarId(p.id))}
                          className="p-1 text-primary hover:bg-surface-container-low rounded" title="Ver detalhes">
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                        {/* Botão de importar NF-e diretamente da linha — para pedidos que aguardam NF-e */}
                        {['ABERTO','ENVIADO','FATURADO'].includes(p.status) && (
                          <button onClick={() => setImportarParaPedido(p)}
                            className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 hover:bg-green-200 px-2 py-1 rounded-lg transition"
                            title="Importar NF-e para este pedido">
                            <span className="material-symbols-outlined text-[14px]">upload_file</span>
                            NF-e
                          </button>
                        )}
                        {p.status === 'RASCUNHO' && (
                          <button onClick={() => { if (confirm('Cancelar pedido?')) cancelar.mutate(p.id); }}
                            className="p-1 text-error hover:bg-error-container rounded" title="Cancelar">
                            <span className="material-symbols-outlined text-[18px]">cancel</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pedidos.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-on-surface-variant text-sm">Nenhum pedido encontrado</td></tr>
              )}
            </tbody>
          </table>
        )}
        <div className="px-4 py-3 border-t border-outline-variant flex items-center justify-between bg-surface">
          <span className="text-sm text-on-surface-variant">Pág. {page}/{totalPages || 1}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1 rounded text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="p-1 rounded text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal Novo Pedido */}
      <Modal open={modalNovo} onClose={() => { setModalNovo(false); resetForm(); }} title="Novo Pedido de Compra" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Fornecedor</label>
              <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="input">
                <option value="">Sem fornecedor</option>
                {(fornecedores?.data || []).map((f: any) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Observação</label>
              <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className="input" />
            </div>
          </div>

          <div className="bg-surface-container-low rounded-lg p-4">
            <p className="text-label-md font-bold uppercase text-on-surface-variant mb-3">Adicionar Item</p>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="label">Código de barras / Nome</label>
                <input value={buscaProd} onChange={(e) => setBuscaProd(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && buscaProd.trim() && buscarProd.mutate(buscaProd.trim())}
                  className="input" placeholder="Enter para buscar..." />
              </div>
              <div className="w-24"><label className="label">Qtd</label>
                <input value={qtd} onChange={(e) => setQtd(e.target.value)} type="number" step="0.001" min="0.001" className="input" />
              </div>
              <div className="w-32"><label className="label">Preço Unit.</label>
                <input value={preco} onChange={(e) => setPreco(e.target.value)} type="number" step="0.01" min="0" className="input" placeholder="0,00" />
              </div>
              <button onClick={() => buscaProd.trim() && buscarProd.mutate(buscaProd.trim())} className="btn-primary h-10">
                <span className="material-symbols-outlined text-[18px]">add</span>
              </button>
            </div>
          </div>

          {itens.length > 0 && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="table-header"><tr>
                  <th className="th">Produto</th><th className="th text-right">Qtd</th>
                  <th className="th text-right">Preço</th><th className="th text-right">Subtotal</th><th className="th w-8"></th>
                </tr></thead>
                <tbody className="divide-y divide-surface-container">
                  {itens.map((item, i) => (
                    <tr key={i} className="tr-hover">
                      <td className="td">{item.produtoNome}</td>
                      <td className="td text-right text-data-mono">{item.quantidade}</td>
                      <td className="td text-right text-data-mono">{formatCurrency(item.precoUnitario)}</td>
                      <td className="td text-right text-data-mono font-bold">{formatCurrency(item.quantidade * item.precoUnitario)}</td>
                      <td className="td"><button onClick={() => setItens((p) => p.filter((_, j) => j !== i))}
                        className="p-1 text-error rounded"><span className="material-symbols-outlined text-[16px]">close</span></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-4 border-t border-outline-variant flex justify-end">
                <span className="font-bold text-on-surface">Total: {formatCurrency(subtotal)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-outline-variant pt-4">
            <button onClick={() => { setModalNovo(false); resetForm(); }} className="btn-outline">Cancelar</button>
            <button onClick={() => criar.mutate()} disabled={itens.length === 0 || criar.isPending} className="btn-success">
              {criar.isPending ? 'Salvando...' : 'Criar Pedido'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Detalhe */}
      {modalDetalhe && (
        <Modal open={!!modalDetalhe} onClose={() => setModalDetalhe(null)} title={`Pedido #${modalDetalhe.numero}`} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><span className="label">Fornecedor</span><p>{modalDetalhe.fornecedor?.nome || '—'}</p></div>
              <div><span className="label">Status</span>
                <p><span className={`badge ${STATUS_CFG[modalDetalhe.status]?.cls}`}>{STATUS_CFG[modalDetalhe.status]?.label}</span></p>
              </div>
              <div><span className="label">Data</span><p>{formatDateTime(modalDetalhe.createdAt)}</p></div>
              {modalDetalhe.observacao && <div className="col-span-3"><span className="label">Observação</span><p>{modalDetalhe.observacao}</p></div>}
            </div>

            <table className="w-full card overflow-hidden text-sm">
              <thead className="table-header"><tr>
                <th className="th">Produto</th><th className="th text-right">Qtd</th>
                <th className="th text-right">Qtd Rec.</th><th className="th text-right">Preço</th><th className="th text-right">Subtotal</th>
              </tr></thead>
              <tbody className="divide-y divide-surface-container">
                {(modalDetalhe.itens || []).map((item: any) => (
                  <tr key={item.id} className="tr-hover">
                    <td className="td">{item.produto?.nome}</td>
                    <td className="td text-right text-data-mono">{item.quantidade}</td>
                    <td className="td text-right text-data-mono text-green-600">{item.quantidadeRecebida}</td>
                    <td className="td text-right text-data-mono">{formatCurrency(item.precoUnitario)}</td>
                    <td className="td text-right text-data-mono font-bold">{formatCurrency(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-between items-center">
              <span className="font-bold text-lg">Total: {formatCurrency(modalDetalhe.total)}</span>
              <div className="flex gap-2">
                {modalDetalhe.status === 'RASCUNHO' && (
                  <button onClick={() => abrir.mutate(modalDetalhe.id)} disabled={abrir.isPending} className="btn-primary">
                    <span className="material-symbols-outlined text-[16px]">check</span> Abrir Pedido
                  </button>
                )}
                {modalDetalhe.status === 'ABERTO' && (
                  <button onClick={() => enviar.mutate(modalDetalhe.id)} disabled={enviar.isPending} className="btn-primary">
                    <span className="material-symbols-outlined text-[16px]">send</span> Enviar ao Fornecedor
                  </button>
                )}
                {modalDetalhe.status === 'ENVIADO' && (
                  <button onClick={() => faturar.mutate(modalDetalhe.id)} disabled={faturar.isPending}
                    className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition">
                    <span className="material-symbols-outlined text-[16px]">receipt_long</span> Marcar como Faturado
                  </button>
                )}
                {/* Próximo passo: importar NF-e quando pedido foi enviado/faturado */}
                {['ENVIADO', 'FATURADO'].includes(modalDetalhe.status) && (
                  <button onClick={() => { setModalDetalhe(null); setImportarParaPedido(modalDetalhe); }}
                    className="btn-success flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">upload_file</span>
                    Importar NF-e do Fornecedor
                  </button>
                )}
                {['RASCUNHO', 'ABERTO', 'ENVIADO'].includes(modalDetalhe.status) && (
                  <button onClick={() => { if (confirm('Cancelar pedido?')) cancelar.mutate(modalDetalhe.id); }}
                    disabled={cancelar.isPending} className="btn-outline text-error border-error hover:bg-error-container">
                    Cancelar
                  </button>
                )}
              </div>
            </div>

            {/* Guia de próximos passos */}
            {['ENVIADO', 'FATURADO'].includes(modalDetalhe.status) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <p className="font-semibold flex items-center gap-1 mb-1">
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  Próximo passo
                </p>
                <p>Quando o fornecedor emitir a nota fiscal, clique em <strong>"Importar NF-e do Fornecedor"</strong> para carregar o XML. O sistema vai comparar o pedido com a NF-e e permitir a conferência dos itens antes de dar entrada no estoque.</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal Importar NF-e — disparado pelo botão "Importar NF-e do Fornecedor" */}
      {importarParaPedido && (
        <ImportarXmlModal
          open={!!importarParaPedido}
          onClose={() => setImportarParaPedido(null)}
          onSuccess={(nf) => {
            setImportarParaPedido(null);
            qc.invalidateQueries({ queryKey: ['pedidos'] });
            // Ir direto para a conferência após importar
            setConferenciaId(nf.id);
          }}
        />
      )}
      </>)}
    </div>
  );
}
