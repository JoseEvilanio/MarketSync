import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { categoriasService } from '@/services/api';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// ── Schema de validação ───────────────────────────────────────────────────────

const schema = z.object({
  nome:     z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  descricao: z.string().optional().nullable(),
  ativo:    z.boolean().default(true),
});

type Form = z.infer<typeof schema>;

// ── Componente ────────────────────────────────────────────────────────────────

export default function CategoriasPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen]   = useState(false);
  const [editando, setEditando]     = useState<any>(null);
  const [busca, setBusca]           = useState('');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { nome: '', descricao: '', ativo: true },
  });

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: categorias = [], isLoading } = useQuery({
    queryKey: ['categorias'],
    queryFn:  () => categoriasService.listar(),
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const salvar = useMutation({
    mutationFn: (data: Form) =>
      editando
        ? categoriasService.atualizar(editando.id, data)
        : categoriasService.criar(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categorias'] });
      toast.success(editando ? 'Categoria atualizada!' : 'Categoria criada!');
      setModalOpen(false);
      setEditando(null);
      reset();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.erro || 'Erro ao salvar categoria';
      toast.error(msg);
    },
  });

  const remover = useMutation({
    mutationFn: (id: string) => categoriasService.remover(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categorias'] });
      toast.success('Categoria removida');
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.erro || 'Não foi possível remover a categoria';
      toast.error(msg);
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  function abrirCriar() {
    setEditando(null);
    reset({ nome: '', descricao: '', ativo: true });
    setModalOpen(true);
  }

  function abrirEditar(cat: any) {
    setEditando(cat);
    reset({ nome: cat.nome, descricao: cat.descricao || '', ativo: cat.ativo });
    setModalOpen(true);
  }

  function fecharModal() {
    if (salvar.isPending) return;
    setModalOpen(false);
    setEditando(null);
    reset();
  }

  function confirmarRemover(cat: any) {
    const qtd = cat._count?.produtos ?? 0;
    if (qtd > 0) {
      toast.error(`Categoria em uso por ${qtd} produto(s). Remova os vínculos antes.`);
      return;
    }
    if (!confirm(`Remover a categoria "${cat.nome}"? Esta ação não pode ser desfeita.`)) return;
    remover.mutate(cat.id);
  }

  // ── Filtro local ───────────────────────────────────────────────────────────

  const listagem = (categorias as any[]).filter((c) =>
    c.nome.toLowerCase().includes(busca.toLowerCase())
  );

  const total    = (categorias as any[]).length;
  const ativas   = (categorias as any[]).filter((c) => c.ativo).length;
  const emUso    = (categorias as any[]).filter((c) => (c._count?.produtos ?? 0) > 0).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Categorias</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Organize seus produtos por categoria
          </p>
        </div>
        <button onClick={abrirCriar} className="btn-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">add</span>
          Nova Categoria
        </button>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-primary">{total}</p>
          <p className="text-sm text-on-surface-variant mt-1">Total</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{ativas}</p>
          <p className="text-sm text-on-surface-variant mt-1">Ativas</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-indigo-600">{emUso}</p>
          <p className="text-sm text-on-surface-variant mt-1">Com produtos</p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
          search
        </span>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar categoria..."
          className="input pl-9 w-full"
        />
        {busca && (
          <button
            onClick={() => setBusca('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="th">Nome</th>
                  <th className="th">Descrição</th>
                  <th className="th text-center">Produtos</th>
                  <th className="th text-center">Status</th>
                  <th className="th w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {listagem.map((cat: any) => (
                  <tr key={cat.id} className="tr-hover group">
                    <td className="td">
                      <p className="font-semibold text-on-surface">{cat.nome}</p>
                    </td>
                    <td className="td text-sm text-on-surface-variant">
                      {cat.descricao || <span className="italic opacity-50">Sem descrição</span>}
                    </td>
                    <td className="td text-center">
                      {(cat._count?.produtos ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                          <span className="material-symbols-outlined text-[12px]">inventory_2</span>
                          {cat._count.produtos}
                        </span>
                      ) : (
                        <span className="text-xs text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="td text-center">
                      {cat.ativo ? (
                        <span className="badge-success badge">Ativa</span>
                      ) : (
                        <span className="badge-error badge">Inativa</span>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => abrirEditar(cat)}
                          className="p-1 text-primary hover:bg-surface-container-low rounded"
                          title="Editar"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          onClick={() => confirmarRemover(cat)}
                          disabled={remover.isPending}
                          className="p-1 text-error hover:bg-error-container rounded disabled:opacity-50"
                          title={
                            (cat._count?.produtos ?? 0) > 0
                              ? 'Em uso por produtos — não pode ser removida'
                              : 'Remover'
                          }
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {listagem.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-on-surface-variant text-sm">
                      {busca
                        ? `Nenhuma categoria encontrada para "${busca}"`
                        : 'Nenhuma categoria cadastrada. Clique em "Nova Categoria" para começar.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {listagem.length > 0 && (
              <div className="px-4 py-3 border-t border-outline-variant bg-surface text-sm text-on-surface-variant">
                {busca
                  ? `${listagem.length} de ${total} categoria(s)`
                  : `${total} categoria(s) cadastrada(s)`}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal criar/editar */}
      <Modal
        open={modalOpen}
        onClose={fecharModal}
        title={editando ? `Editar: ${editando.nome}` : 'Nova Categoria'}
        size="sm"
      >
        <form onSubmit={handleSubmit((d) => salvar.mutate(d))} className="space-y-4">

          {/* Nome */}
          <div>
            <label className="label">
              Nome <span className="text-error">*</span>
            </label>
            <input
              {...register('nome')}
              className={`input ${errors.nome ? 'border-error ring-1 ring-error' : ''}`}
              placeholder="Ex: Bebidas, Laticínios, Higiene..."
              autoFocus
            />
            {errors.nome && (
              <p className="text-xs text-error mt-1">{errors.nome.message}</p>
            )}
          </div>

          {/* Descrição */}
          <div>
            <label className="label">Descrição <span className="text-xs text-on-surface-variant">(opcional)</span></label>
            <input
              {...register('descricao')}
              className="input"
              placeholder="Descreva a categoria..."
            />
          </div>

          {/* Ativo */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              {...register('ativo')}
              className="rounded border-outline text-primary w-4 h-4"
            />
            <div>
              <span className="text-sm font-medium text-on-surface">Categoria ativa</span>
              <p className="text-xs text-on-surface-variant">
                Categorias inativas não aparecem nos formulários de produto
              </p>
            </div>
          </label>

          {/* Botões */}
          <div className="flex justify-end gap-3 border-t border-outline-variant pt-4">
            <button type="button" onClick={fecharModal} disabled={salvar.isPending} className="btn-outline">
              Cancelar
            </button>
            <button type="submit" disabled={salvar.isPending} className="btn-primary flex items-center gap-2">
              {salvar.isPending ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  Salvando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">save</span>
                  {editando ? 'Salvar Alterações' : 'Criar Categoria'}
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
