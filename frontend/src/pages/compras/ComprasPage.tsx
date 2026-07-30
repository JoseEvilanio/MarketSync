import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { comprasService, fornecedoresService, produtosService } from '@/services/api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

import { EntradaMercadoriasModal } from '@/components/compras/EntradaMercadoriasModal';

interface ItemForm { produtoId: string; produtoNome: string; quantidade: number; precoUnit: number; }

export default function ComprasPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [modalNova, setModalNova] = useState(false);
  const [modalEntrada, setModalEntrada] = useState(false);
  const [modalDetalhe, setModalDetalhe] = useState<any>(null);

  // Form nova compra
  const [fornecedorId, setFornecedorId] = useState('');
  const [notaFiscal, setNotaFiscal] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [itens, setItens] = useState<ItemForm[]>([]);
  const [buscaProd, setBuscaProd] = useState('');
  const [qtd, setQtd] = useState('1');
  const [preco, setPreco] = useState('');

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
        produtoId: prod.id,
        produtoNome: prod.nome,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      toast.success('Compra criada como rascunho');
      setModalNova(false);
      resetForm();
    },
  });

  const concluir = useMutation({
    mutationFn: (id: string) => comprasService.concluir(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['produtos'] });
      toast.success('Compra concluída — estoque atualizado!');
      setModalDetalhe(null);
    },
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => comprasService.cancelar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      toast.success('Compra cancelada');
    },
  });

  function resetForm() {
    setFornecedorId(''); setNotaFiscal(''); setObservacoes('');
    setItens([]); setBuscaProd(''); setQtd('1'); setPreco('');
  }

  function removerItem(idx: number) { setItens((prev) => prev.filter((_, i) => i !== idx)); }

  const subtotalForm = itens.reduce((a, i) => a + i.quantidade * i.precoUnit, 0);

  const statusLabel: Record<string, { label: string; cls: string }> = {
    RASCUNHO:  { label: 'Rascunho',  cls: 'badge-neutral' },
    CONCLUIDA: { label: 'Concluída', cls: 'badge-success' },
    CANCELADA: { label: 'Cancelada', cls: 'badge-error'   },
  };

  const compras = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-md">
        <div>
          <h3 className="text-headline-lg text-on-surface">Compras</h3>
          <p className="text-body-md text-on-surface-variant mt-xs">{total} compra(s)</p>
        </div>
        <div className="flex gap-sm">
          <button onClick={() => setModalEntrada(true)} className="btn-primary flex items-center gap-1.5 font-bold">
            <span className="material-symbols-outlined text-[20px]">inventory_2</span>
            Entrada de Nota / Formação de Preço
          </button>
          <button onClick={() => setModalNova(true)} className="btn-success flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
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
                  <th className="th">#</th>
                  <th className="th">Fornecedor</th>
                  <th className="th">Nota Fiscal</th>
                  <th className="th text-right">Total</th>
                  <th className="th text-center">Status</th>
                  <th className="th">Data</th>
                  <th className="th w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {compras.map((c: any) => {
                  const st = statusLabel[c.status] || { label: c.status, cls: 'badge-neutral' };
                  return (
                    <tr key={c.id} className="tr-hover group">
                      <td className="td text-data-mono font-bold text-on-surface">{c.numero}</td>
                      <td className="td text-body-sm text-on-surface">{c.fornecedor?.nome || 'Sem fornecedor'}</td>
                      <td className="td text-body-sm text-on-surface-variant">{c.notaFiscal || '—'}</td>
                      <td className="td text-right text-data-mono font-semibold">{formatCurrency(c.total)}</td>
                      <td className="td text-center"><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td className="td text-body-sm text-on-surface-variant">{formatDateTime(c.createdAt)}</td>
                      <td className="td">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={async () => {
                            const det = await comprasService.buscarId(c.id);
                            setModalDetalhe(det);
                          }} className="p-1 text-primary hover:bg-surface-container-low rounded">
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
                  <tr><td colSpan={7} className="py-12 text-center text-on-surface-variant text-body-sm">Nenhuma compra encontrada</td></tr>
                )}
              </tbody>
            </table>
            <div className="px-md py-sm border-t border-outline-variant flex items-center justify-between bg-surface">
              <span className="text-body-sm text-on-surface-variant">Pág. {page}/{totalPages || 1}</span>
              <div className="flex gap-xs">
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

      {/* Modal nova compra */}
      <Modal open={modalNova} onClose={() => { setModalNova(false); resetForm(); }} title="Nova Compra" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Fornecedor</label>
              <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="input">
                <option value="">Sem fornecedor</option>
                {(fornecedores?.data || []).map((f: any) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Nota Fiscal</label>
              <input value={notaFiscal} onChange={(e) => setNotaFiscal(e.target.value)} className="input" placeholder="NF-e número..." />
            </div>
            <div>
              <label className="label">Observações</label>
              <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="input" />
            </div>
          </div>

          {/* Busca de produto */}
          <div className="bg-surface-container-low rounded-lg p-md">
            <p className="text-label-md text-on-surface-variant mb-sm uppercase">Adicionar Produto</p>
            <div className="flex gap-sm items-end">
              <div className="flex-1">
                <label className="label">Código de barras / Nome</label>
                <input value={buscaProd} onChange={(e) => setBuscaProd(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && buscaProd.trim() && buscarProd.mutate(buscaProd.trim())}
                  className="input" placeholder="Enter para buscar..." />
              </div>
              <div className="w-24">
                <label className="label">Qtd</label>
                <input value={qtd} onChange={(e) => setQtd(e.target.value)} type="number" step="0.001" min="0.001" className="input" />
              </div>
              <div className="w-32">
                <label className="label">Preço Unit.</label>
                <input value={preco} onChange={(e) => setPreco(e.target.value)} type="number" step="0.01" min="0" className="input" placeholder="0,00" />
              </div>
              <button onClick={() => buscaProd.trim() && buscarProd.mutate(buscaProd.trim())} className="btn-primary h-10">
                <span className="material-symbols-outlined text-[18px]">add</span>
              </button>
            </div>
          </div>

          {/* Itens adicionados */}
          {itens.length > 0 && (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="th">Produto</th>
                    <th className="th text-right">Qtd</th>
                    <th className="th text-right">Preço Unit.</th>
                    <th className="th text-right">Subtotal</th>
                    <th className="th w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {itens.map((item, i) => (
                    <tr key={i} className="tr-hover">
                      <td className="td text-body-sm font-medium text-on-surface">{item.produtoNome}</td>
                      <td className="td text-right text-data-mono">{item.quantidade}</td>
                      <td className="td text-right text-data-mono">{formatCurrency(item.precoUnit)}</td>
                      <td className="td text-right text-data-mono font-bold">{formatCurrency(item.quantidade * item.precoUnit)}</td>
                      <td className="td">
                        <button onClick={() => removerItem(i)} className="p-1 text-error rounded hover:bg-error-container">
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-md border-t border-outline-variant flex justify-end">
                <span className="text-headline-md font-bold text-on-surface">
                  Total: {formatCurrency(subtotalForm)}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-sm border-t border-outline-variant pt-4">
            <button onClick={() => { setModalNova(false); resetForm(); }} className="btn-outline">Cancelar</button>
            <button onClick={() => criar.mutate()} disabled={itens.length === 0 || criar.isPending} className="btn-success">
              {criar.isPending ? 'Salvando...' : 'Salvar Compra'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal detalhe */}
      {modalDetalhe && (
        <Modal open={!!modalDetalhe} onClose={() => setModalDetalhe(null)} title={`Compra #${modalDetalhe.numero}`} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-body-sm">
              <div><span className="label">Fornecedor</span><p>{modalDetalhe.fornecedor?.nome || '—'}</p></div>
              <div><span className="label">Nota Fiscal</span><p>{modalDetalhe.notaFiscal || '—'}</p></div>
              <div><span className="label">Data</span><p>{formatDateTime(modalDetalhe.createdAt)}</p></div>
            </div>
            <table className="w-full card overflow-hidden">
              <thead className="table-header">
                <tr>
                  <th className="th">Produto</th>
                  <th className="th text-right">Qtd</th>
                  <th className="th text-right">Preço Unit.</th>
                  <th className="th text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {(modalDetalhe.itens || []).map((item: any) => (
                  <tr key={item.id} className="tr-hover">
                    <td className="td text-body-sm text-on-surface">{item.produto?.nome}</td>
                    <td className="td text-right text-data-mono">{item.quantidade}</td>
                    <td className="td text-right text-data-mono">{formatCurrency(item.precoUnit)}</td>
                    <td className="td text-right text-data-mono font-bold">{formatCurrency(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between items-center">
              <span className="text-headline-md font-bold">Total: {formatCurrency(modalDetalhe.total)}</span>
              <div className="flex gap-sm">
                {modalDetalhe.status === 'RASCUNHO' && (
                  <button onClick={() => concluir.mutate(modalDetalhe.id)} disabled={concluir.isPending} className="btn-success">
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    {concluir.isPending ? 'Processando...' : 'Concluir e Dar Entrada'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
      {/* Modal Entrada de Mercadorias (PRD v1.0) */}
      <EntradaMercadoriasModal open={modalEntrada} onClose={() => setModalEntrada(false)} />
    </div>
  );
}
