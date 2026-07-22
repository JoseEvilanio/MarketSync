import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { fornecedoresService } from '@/services/api';
import { formatCNPJ, formatPhone } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function FornecedoresPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['fornecedores', q, page],
    queryFn: () => fornecedoresService.listar({ q, page, limit: 20 }),
  });

  const { register, handleSubmit, reset, setValue } = useForm<any>();

  const salvar = useMutation({
    mutationFn: (d: any) => {
      const payload = {
        nome: d.nome,
        razaoSocial: d.razaoSocial || null,
        cnpj: d.cnpj || null,
        telefone: d.telefone || null,
        whatsapp: d.whatsapp || null,
        email: d.email || null,
        endereco: d.endereco || null,
        cidade: d.cidade || null,
        contato: d.contato || null,
        ativo: d.ativo ?? true,
      };
      return editando ? fornecedoresService.atualizar(editando.id, payload) : fornecedoresService.criar(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fornecedores'] });
      toast.success(editando ? 'Fornecedor atualizado' : 'Fornecedor cadastrado');
      setModalOpen(false);
      setEditando(null);
      reset();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.erro || err.response?.data?.detalhes?.join(', ') || 'Erro ao salvar fornecedor';
      toast.error(msg);
    },
  });

  const remover = useMutation({
    mutationFn: (id: string) => fornecedoresService.remover(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fornecedores'] }); toast.success('Fornecedor removido'); },
  });

  function abrirEditar(f: any) {
    setEditando(f);
    reset({
      nome: f.nome || '',
      razaoSocial: f.razaoSocial || '',
      cnpj: formatCNPJ(f.cnpj || ''),
      telefone: formatPhone(f.telefone || ''),
      whatsapp: formatPhone(f.whatsapp || ''),
      email: f.email || '',
      endereco: f.endereco || '',
      cidade: f.cidade || '',
      contato: f.contato || '',
      ativo: f.ativo ?? true,
    });
    setModalOpen(true);
  }

  function abrirNovo() {
    setEditando(null);
    reset({ nome: '', razaoSocial: '', cnpj: '', telefone: '', whatsapp: '', email: '', endereco: '', cidade: '', contato: '', ativo: true });
    setModalOpen(true);
  }

  const fornecedores = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-md">
        <div>
          <h3 className="text-headline-lg text-on-surface">Fornecedores</h3>
          <p className="text-body-md text-on-surface-variant mt-xs">{total} fornecedor(es)</p>
        </div>
        <button onClick={abrirNovo} className="btn-success">
          <span className="material-symbols-outlined text-[18px]">add_business</span>
          Novo Fornecedor
        </button>
      </div>

      <div className="card p-md mb-md">
        <div className="relative max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Nome ou CNPJ..."
            className="input pl-9" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner /> : (
          <>
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="th">Nome / Razão Social</th>
                  <th className="th">CNPJ</th>
                  <th className="th">Telefone</th>
                  <th className="th">Contato</th>
                  <th className="th">E-mail</th>
                  <th className="th w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {fornecedores.map((f: any) => (
                  <tr key={f.id} className="tr-hover group">
                    <td className="td">
                      <p className="text-body-sm font-medium text-on-surface">{f.nome}</p>
                      {f.razaoSocial && <p className="text-label-md text-on-surface-variant">{f.razaoSocial}</p>}
                    </td>
                    <td className="td text-data-mono text-on-surface-variant">{f.cnpj ? formatCNPJ(f.cnpj) : '—'}</td>
                    <td className="td text-body-sm text-on-surface-variant">{f.telefone ? formatPhone(f.telefone) : '—'}</td>
                    <td className="td text-body-sm text-on-surface-variant">{f.contato || '—'}</td>
                    <td className="td text-body-sm text-on-surface-variant truncate max-w-xs">{f.email || '—'}</td>
                    <td className="td">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button onClick={() => abrirEditar(f)} className="p-1 text-primary hover:bg-surface-container-low rounded">
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button onClick={() => { if (confirm('Remover fornecedor?')) remover.mutate(f.id); }}
                          className="p-1 text-error hover:bg-error-container rounded">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {fornecedores.length === 0 && (
                  <tr><td colSpan={6} className="py-12 text-center text-on-surface-variant text-body-sm">Nenhum fornecedor encontrado</td></tr>
                )}
              </tbody>
            </table>
            <div className="px-md py-sm border-t border-outline-variant flex items-center justify-between bg-surface">
              <span className="text-body-sm text-on-surface-variant">{total} fornecedor(es) · Pág. {page}/{totalPages || 1}</span>
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

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditando(null); }}
        title={editando ? 'Editar Fornecedor' : 'Novo Fornecedor'} size="lg">
        <form onSubmit={handleSubmit((d) => salvar.mutate(d))} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Nome *</label>
            <input {...register('nome', { required: true })} className="input" placeholder="Nome fantasia" />
          </div>
          <div>
            <label className="label">Razão Social</label>
            <input {...register('razaoSocial')} className="input" />
          </div>
          <div>
            <label className="label">CNPJ</label>
            <input
              {...register('cnpj')}
              onChange={(e) => setValue('cnpj', formatCNPJ(e.target.value))}
              className="input"
              placeholder="00.000.000/0001-00"
            />
          </div>
          <div>
            <label className="label">Telefone</label>
            <input
              {...register('telefone')}
              onChange={(e) => setValue('telefone', formatPhone(e.target.value))}
              className="input"
              placeholder="(00) 0000-0000"
            />
          </div>
          <div>
            <label className="label">WhatsApp</label>
            <input
              {...register('whatsapp')}
              onChange={(e) => setValue('whatsapp', formatPhone(e.target.value))}
              className="input"
              placeholder="(00) 00000-0000"
            />
          </div>
          <div className="col-span-2">
            <label className="label">E-mail</label>
            <input {...register('email')} type="email" className="input" />
          </div>
          <div>
            <label className="label">Contato (nome da pessoa)</label>
            <input {...register('contato')} className="input" />
          </div>
          <div>
            <label className="label">Cidade</label>
            <input {...register('cidade')} className="input" />
          </div>
          <div className="col-span-2">
            <label className="label">Endereço</label>
            <input {...register('endereco')} className="input" />
          </div>
          <div className="col-span-2 flex justify-end gap-sm pt-2 border-t border-outline-variant">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={salvar.isPending} className="btn-success">
              {salvar.isPending ? 'Salvando...' : 'Salvar Fornecedor'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
