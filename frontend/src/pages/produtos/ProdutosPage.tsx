import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { produtosService, categoriasService, fornecedoresService } from '@/services/api';
import { formatCurrency, formatPercent } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const schema = z.object({
  codigoBarras: z.string().optional(),
  codigoInterno: z.string().optional(),
  nome: z.string().min(2, 'Nome obrigatório'),
  descricao: z.string().optional(),
  categoriaId: z.string().optional(),
  fornecedorId: z.string().optional(),
  unidade: z.string().default('UN'),
  precoCompra: z.coerce.number().min(0),
  precoVenda: z.coerce.number().min(0.01, 'Preço obrigatório'),
  estoqueAtual: z.coerce.number().min(0),
  estoqueMinimo: z.coerce.number().min(0),
  ativo: z.boolean().default(true),
});
type Form = z.infer<typeof schema>;

export default function ProdutosPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['produtos', q, catFilter, page],
    queryFn: () => produtosService.listar({ q, categoriaId: catFilter, page, limit: 20 }),
  });

  const { data: categorias } = useQuery({
    queryKey: ['categorias'],
    queryFn: categoriasService.listar,
  });

  const { data: fornecedores } = useQuery({
    queryKey: ['fornecedores-lista'],
    queryFn: () => fornecedoresService.listar({ limit: 200 }),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const salvar = useMutation({
    mutationFn: (data: Form) =>
      editando
        ? produtosService.atualizar(editando.id, data)
        : produtosService.criar(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['produtos'] });
      toast.success(editando ? 'Produto atualizado' : 'Produto criado');
      setModalOpen(false);
      setEditando(null);
      reset();
    },
  });

  const remover = useMutation({
    mutationFn: (id: string) => produtosService.remover(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['produtos'] });
      toast.success('Produto removido');
    },
  });

  function abrirEditar(prod: any) {
    setEditando(prod);
    reset({
      nome: prod.nome,
      codigoBarras: prod.codigoBarras || '',
      codigoInterno: prod.codigoInterno || '',
      descricao: prod.descricao || '',
      categoriaId: prod.categoriaId || '',
      fornecedorId: prod.fornecedorId || '',
      unidade: prod.unidade,
      precoCompra: Number(prod.precoCompra),
      precoVenda: Number(prod.precoVenda),
      estoqueAtual: prod.estoqueAtual,
      estoqueMinimo: prod.estoqueMinimo,
      ativo: prod.ativo,
    });
    setModalOpen(true);
  }

  function abrirNovo() {
    setEditando(null);
    reset({ unidade: 'UN', precoCompra: 0, precoVenda: 0, estoqueAtual: 0, estoqueMinimo: 0, ativo: true });
    setModalOpen(true);
  }

  const produtos = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  function stockBadge(est: number, min: number) {
    if (est <= 0) return <span className="badge badge-error">Zerado</span>;
    if (est <= min) return <span className="badge badge-warning">Baixo</span>;
    return <span className="badge badge-success">Ok</span>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-md gap-md">
        <div>
          <h3 className="text-headline-lg text-on-surface">Gestão de Produtos</h3>
          <p className="text-body-md text-on-surface-variant mt-xs">{total} produto(s) cadastrado(s)</p>
        </div>
        <div className="flex gap-sm">
          <button onClick={abrirNovo} className="btn-success">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Novo Produto
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-md mb-md flex flex-wrap gap-md items-end">
        <div className="flex-1 min-w-48">
          <label className="label">Buscar</label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Nome, código de barras..."
              className="input pl-9"
            />
          </div>
        </div>
        <div>
          <label className="label">Categoria</label>
          <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1); }}
            className="input min-w-40">
            <option value="">Todas</option>
            {(categorias || []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="th w-20">Código</th>
                    <th className="th min-w-48">Nome</th>
                    <th className="th">Categoria</th>
                    <th className="th text-right">Compra</th>
                    <th className="th text-right">Venda</th>
                    <th className="th text-right">Margem</th>
                    <th className="th text-center">Estoque</th>
                    <th className="th w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {produtos.map((p: any) => (
                    <tr key={p.id} className="tr-hover group">
                      <td className="td text-data-mono text-on-surface-variant text-[12px]">
                        {p.codigoBarras || p.codigoInterno || '—'}
                      </td>
                      <td className="td">
                        <p className="text-body-sm font-medium text-on-surface">{p.nome}</p>
                        <p className="text-label-md text-on-surface-variant">{p.unidade}</p>
                      </td>
                      <td className="td text-body-sm text-on-surface-variant">{p.categoria?.nome || '—'}</td>
                      <td className="td text-right text-data-mono">{formatCurrency(p.precoCompra)}</td>
                      <td className="td text-right text-data-mono font-semibold">{formatCurrency(p.precoVenda)}</td>
                      <td className="td text-right text-secondary text-data-mono">
                        {p.margemLucro ? formatPercent(p.margemLucro) : '—'}
                      </td>
                      <td className="td text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-data-mono font-semibold">{p.estoqueAtual}</span>
                          {stockBadge(p.estoqueAtual, p.estoqueMinimo)}
                        </div>
                      </td>
                      <td className="td">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => abrirEditar(p)} className="p-1 text-primary hover:bg-surface-container-low rounded">
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button
                            onClick={() => { if (confirm('Remover produto?')) remover.mutate(p.id); }}
                            className="p-1 text-error hover:bg-error-container rounded"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {produtos.length === 0 && (
                <div className="py-16 text-center text-on-surface-variant text-body-sm">
                  Nenhum produto encontrado
                </div>
              )}
            </div>
            {/* Paginação */}
            <div className="px-md py-sm border-t border-outline-variant flex items-center justify-between bg-surface">
              <span className="text-body-sm text-on-surface-variant">
                {total} produto(s) · Página {page} de {totalPages || 1}
              </span>
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

      {/* Modal cadastro/edição */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditando(null); }}
        title={editando ? 'Editar Produto' : 'Novo Produto'} size="lg">
        <form onSubmit={handleSubmit((d) => salvar.mutate(d))} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Nome *</label>
            <input {...register('nome')} className="input" placeholder="Nome do produto" />
            {errors.nome && <p className="text-error text-body-sm mt-1">{errors.nome.message}</p>}
          </div>
          <div>
            <label className="label">Código de Barras</label>
            <input {...register('codigoBarras')} className="input" placeholder="EAN-13" />
          </div>
          <div>
            <label className="label">Código Interno</label>
            <input {...register('codigoInterno')} className="input" placeholder="SKU interno" />
          </div>
          <div>
            <label className="label">Categoria</label>
            <select {...register('categoriaId')} className="input">
              <option value="">Selecione...</option>
              {(categorias || []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Fornecedor</label>
            <select {...register('fornecedorId')} className="input">
              <option value="">Selecione...</option>
              {(fornecedores?.data || []).map((f: any) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Unidade</label>
            <select {...register('unidade')} className="input">
              {['UN', 'KG', 'G', 'L', 'ML', 'CX', 'PC', 'DZ', 'M', 'M2'].map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Preço de Compra *</label>
            <input {...register('precoCompra')} type="number" step="0.01" className="input" placeholder="0,00" />
          </div>
          <div>
            <label className="label">Preço de Venda *</label>
            <input {...register('precoVenda')} type="number" step="0.01" className="input" placeholder="0,00" />
            {errors.precoVenda && <p className="text-error text-body-sm mt-1">{errors.precoVenda.message}</p>}
          </div>
          <div>
            <label className="label">Estoque Atual</label>
            <input {...register('estoqueAtual')} type="number" step="0.001" className="input" />
          </div>
          <div>
            <label className="label">Estoque Mínimo</label>
            <input {...register('estoqueMinimo')} type="number" step="0.001" className="input" />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input {...register('ativo')} type="checkbox" id="ativo" className="w-4 h-4 accent-primary" />
            <label htmlFor="ativo" className="text-body-md text-on-surface">Produto ativo</label>
          </div>
          <div className="col-span-2 flex justify-end gap-sm pt-2 border-t border-outline-variant">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={salvar.isPending} className="btn-success">
              {salvar.isPending ? 'Salvando...' : 'Salvar Produto'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
