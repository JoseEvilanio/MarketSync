/**
 * ComprasLegadoPage — mantém o módulo original de compras rápidas (v1.0)
 * para compatibilidade com o histórico e como atalho de entrada simplificada.
 * Não foi removido para preservar registros anteriores e o fluxo de
 * "Entrada de Nota / Formação de Preço" (EntradaMercadoriasModal).
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { comprasService, fornecedoresService, produtosService } from '@/services/api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { EntradaMercadoriasModal } from '@/components/compras/EntradaMercadoriasModal';

interface ItemForm { produtoId: string; produtoNome: string; quantidade: number; precoUnit: number; }

export default function ComprasLegadoPage() {
  const qc = useQueryClient();
  const [page, setPage]         = useState(1);
  const [modalNova, setModalNova]     = useState(false);
  const [modalEntrada, setModalEntrada] = useState(false);
  const [modalDetalhe, setModalDetalhe] = useState<any>(null);

  const [fornecedorId, setFornecedorId] = useState('');
  const [notaFiscal, setNotaFiscal]     = useState('');
  const [observacoes, setObservacoes]   = useState('');
  const [itens, setItens]               = useState<ItemForm[]>([]);
  const [buscaProd, setBuscaProd]       = useState('');
  const [qtd, setQtd]                   = useState('1');
  const [preco, setPreco]               = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['compras', page],
    queryFn: () => comprasService.listar({ page, limit: 20 }),
  });

  const { data: fornecedores } = useQuery({
    queryKey: ['fornecedores-lista'],
    queryFn: () => fornecedoresService.listar({ limit: 200 }),
  });

  const buscarProd = useMutation({
    mutationFn: (c: string) => produtosService.buscarBarras(c),
    onSuccess: (prod) => {
      setItens((prev) => [...prev, {
        produtoId: prod.id, produtoNome: prod.nome,
        quantidade: Number(qtd) || 1,
        precoUnit: Number(preco) || Number(prod.precoCompra),
      }]);
      setBuscaProd(''); setQtd('1'); setPreco('');
    },
    onError: () => toast.error('Produto não encontrado'),
  });

  const criar = useMutation({
    mutationFn: () => comprasService.criar({
      fornecedorId: fornecedorId || undefined,
      itens: itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, precoUnit: i.precoUnit })),
      notaFiscal: notaFiscal || undefined,
      observacoes: observacoes || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compras'] }); toast.success('Compra criada como rascunho'); setModalNova(false); resetForm(); },
  });

  const concluir = useMutation({
    mutationFn: (id: string) => comprasService.concluir(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] }); qc.invalidateQueries({ queryKey: ['produtos'] });
      toast.success('Compra concluída — estoque atualizado!'); setModalDetalhe(null);
    },
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => comprasService.cancelar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compras'] }); toast.success('Compra cancelada'); },
  });

  function resetForm() { setFornecedorId(''); setNotaFiscal(''); setObservacoes(''); setItens([]); setBuscaProd(''); setQtd('1'); setPreco(''); }

  const statusLabel: Record<string, { label: string; cls: string }> = {
    RASCUNHO:  { label: 'Rascunho',  cls: 'badge-neutral' },
    CONCLUIDA: { label: 'Concluída', cls: 'badge-success' },
    CANCELADA: { label: 'Cancelada', cls: 'badge-error'   },
  };

  const compras    = data?.data || [];
  const total      = data?.total || 0;
  const totalPages = Math.ceil(total / 20);
  const subtotalForm = itens.reduce((a, i) => a + i.quantidade * i.precoUnit, 0);

  return (
    <div className="space-y-4">
      {/* Aviso legado */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <span className="material-symbols-outlined text-blue-600 shrink-0">info</span>
        <div>
          <strong>Módulo de Entradas v1.0 (legado)</strong> — Este módulo está mantido para acesso ao histórico e para
          entradas rápidas sem NF-e. Para o fluxo completo com importação de XML, conferência e controle de divergências,
          use as abas <strong>Pedidos</strong> e <strong>Notas Fiscais</strong>.
        </div>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-sm text-on-surface-variant">{total} compra(s) registrada(s)</p>
        <div className="flex gap-2">
          <button onClick={() => setModalEntrada(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <span className="material-symbols-outlined text-[18px]">inventory_2</span>
            Entrada de Nota / Formação de Preço
          </button>
          <button onClick={() => setModalNova(true)} className="btn-outline flex items-center gap-1.5 text-sm">
            <span className="material-symbols-outlined text-[16px]">add_shopping_cart</span>
            Nova Compra Rápida
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner /> : (
          <>
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="th">#</th><th className="th">Fornecedor</th>
                  <th className="th">Nota Fiscal</th><th className="th text-right">Total</th>
                  <th className="th text-center">Status</th><th className="th">Data</th><th className="th w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {compras.map((c: any) => {
                  const st = statusLabel[c.status] || { label: c.status, cls: 'badge-neutral' };
                  return (
                    <tr key={c.id} className="tr-hover group">
                      <td className="td text-data-mono font-bold">{c.numero}</td>
                      <td className="td text-sm">{c.fornecedor?.nome || 'Sem fornecedor'}</td>
                      <td className="td text-sm text-on-surface-variant">{c.notaFiscal || '—'}</td>
                      <td className="td text-right text-data-mono font-semibold">{formatCurrency(c.total)}</td>
                      <td className="td text-center"><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td className="td text-sm text-on-surface-variant">{formatDateTime(c.createdAt)}</td>
                      <td className="td">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={async () => setModalDetalhe(await comprasService.buscarId(c.id))}
                            className="p-1 text-primary hover:bg-surface-container-low rounded">
                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                          </button>
                          {c.status === 'RASCUNHO' && (
                            <button onClick={() => { if (confirm('Cancelar compra?')) cancelar.mutate(c.id); }}
                              className="p-1 text-error hover:bg-error-container rounded">
                              <span className="material-symbols-outlined text-[18px]">cancel</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {compras.length === 0 && (
                  <tr><td colSpan={7} className="py-12 text-center text-on-surface-variant text-sm">Nenhuma compra encontrada</td></tr>
                )}
              </tbody>
            </table>
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
          </>
        )}
      </div>

      {/* Modal Nova Compra */}
      <Modal open={modalNova} onClose={() => { setModalNova(false); resetForm(); }} title="Nova Compra Rápida" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div><label className="label">Fornecedor</label>
              <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="input">
                <option value="">Sem fornecedor</option>
                {(fornecedores?.data || []).map((f: any) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div><label className="label">Nota Fiscal</label>
              <input value={notaFiscal} onChange={(e) => setNotaFiscal(e.target.value)} className="input" placeholder="NF-e número..." />
            </div>
            <div><label className="label">Observações</label>
              <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="input" />
            </div>
          </div>
          <div className="bg-surface-container-low rounded-lg p-4">
            <p className="text-xs font-bold uppercase text-on-surface-variant mb-3">Adicionar Produto</p>
            <div className="flex gap-3 items-end">
              <div className="flex-1"><label className="label">Código / Nome</label>
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
            <div className="card overflow-hidden text-sm">
              <table className="w-full">
                <thead className="table-header"><tr>
                  <th className="th">Produto</th><th className="th text-right">Qtd</th>
                  <th className="th text-right">Preço</th><th className="th text-right">Subtotal</th><th className="th w-8"></th>
                </tr></thead>
                <tbody className="divide-y divide-surface-container">
                  {itens.map((item, i) => (
                    <tr key={i}><td className="td">{item.produtoNome}</td>
                      <td className="td text-right text-data-mono">{item.quantidade}</td>
                      <td className="td text-right text-data-mono">{formatCurrency(item.precoUnit)}</td>
                      <td className="td text-right text-data-mono font-bold">{formatCurrency(item.quantidade * item.precoUnit)}</td>
                      <td className="td"><button onClick={() => setItens((p) => p.filter((_, j) => j !== i))}
                        className="p-1 text-error rounded"><span className="material-symbols-outlined text-[16px]">close</span></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-4 border-t flex justify-end font-bold">{formatCurrency(subtotalForm)}</div>
            </div>
          )}
          <div className="flex justify-end gap-3 border-t border-outline-variant pt-4">
            <button onClick={() => { setModalNova(false); resetForm(); }} className="btn-outline">Cancelar</button>
            <button onClick={() => criar.mutate()} disabled={itens.length === 0 || criar.isPending} className="btn-success">
              {criar.isPending ? 'Salvando...' : 'Salvar Compra'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Detalhe */}
      {modalDetalhe && (
        <Modal open={!!modalDetalhe} onClose={() => setModalDetalhe(null)} title={`Compra #${modalDetalhe.numero}`} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><span className="label">Fornecedor</span><p>{modalDetalhe.fornecedor?.nome || '—'}</p></div>
              <div><span className="label">Nota Fiscal</span><p>{modalDetalhe.notaFiscal || '—'}</p></div>
              <div><span className="label">Data</span><p>{formatDateTime(modalDetalhe.createdAt)}</p></div>
            </div>
            <table className="w-full card overflow-hidden text-sm">
              <thead className="table-header"><tr>
                <th className="th">Produto</th><th className="th text-right">Qtd</th>
                <th className="th text-right">Preço</th><th className="th text-right">Subtotal</th>
              </tr></thead>
              <tbody className="divide-y divide-surface-container">
                {(modalDetalhe.itens || []).map((item: any) => (
                  <tr key={item.id} className="tr-hover">
                    <td className="td">{item.produto?.nome}</td>
                    <td className="td text-right text-data-mono">{item.quantidade}</td>
                    <td className="td text-right text-data-mono">{formatCurrency(item.precoUnit)}</td>
                    <td className="td text-right text-data-mono font-bold">{formatCurrency(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between items-center">
              <span className="font-bold text-lg">Total: {formatCurrency(modalDetalhe.total)}</span>
              {modalDetalhe.status === 'RASCUNHO' && (
                <button onClick={() => concluir.mutate(modalDetalhe.id)} disabled={concluir.isPending} className="btn-success flex items-center gap-1">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  {concluir.isPending ? 'Processando...' : 'Concluir e Dar Entrada'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      <EntradaMercadoriasModal open={modalEntrada} onClose={() => setModalEntrada(false)} />
    </div>
  );
}
