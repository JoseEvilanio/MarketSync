import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { clientesService } from '@/services/api';
import { formatDateTime } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const schema = z.object({
  nome:          z.string().min(2, 'Nome obrigatório'),
  cpf:           z.string().optional(),
  telefone:      z.string().optional(),
  whatsapp:      z.string().optional(),
  endereco:      z.string().optional(),
  cidade:        z.string().optional(),
  bairro:        z.string().optional(),
  limiteCredito: z.coerce.number().min(0).default(0),
  observacoes:   z.string().optional(),
});
type Form = z.infer<typeof schema>;

export default function ClientesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['clientes', q, page],
    queryFn: () => clientesService.listar({ q, page, limit: 20 }),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const salvar = useMutation({
    mutationFn: (d: Form) => {
      const payload = {
        ...d,
        cpf: d.cpf || null,
        telefone: d.telefone || null,
        whatsapp: d.whatsapp || null,
        endereco: d.endereco || null,
        cidade: d.cidade || null,
        bairro: d.bairro || null,
        observacoes: d.observacoes || null,
      };
      return editando ? clientesService.atualizar(editando.id, payload) : clientesService.criar(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      toast.success(editando ? 'Cliente atualizado' : 'Cliente cadastrado');
      setModalOpen(false);
      setEditando(null);
      reset();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.erro || err.response?.data?.detalhes?.join(', ') || 'Erro ao salvar cliente';
      toast.error(msg);
    },
  });

  const remover = useMutation({
    mutationFn: (id: string) => clientesService.remover(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); toast.success('Cliente removido'); },
  });

  function abrirEditar(c: any) {
    setEditando(c);
    reset({ nome: c.nome, cpf: c.cpf || '', telefone: c.telefone || '', whatsapp: c.whatsapp || '', endereco: c.endereco || '', cidade: c.cidade || '', bairro: c.bairro || '', limiteCredito: Number(c.limiteCredito), observacoes: c.observacoes || '' });
    setModalOpen(true);
  }

  function abrirNovo() {
    setEditando(null);
    reset({ limiteCredito: 0 });
    setModalOpen(true);
  }

  const clientes = data?.data || [];
  const total    = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-md">
        <div>
          <h3 className="text-headline-lg text-on-surface">Clientes</h3>
          <p className="text-body-md text-on-surface-variant mt-xs">{total} cliente(s)</p>
        </div>
        <button onClick={abrirNovo} className="btn-success">
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          Novo Cliente
        </button>
      </div>

      {/* Filtro */}
      <div className="card p-md mb-md">
        <div className="relative max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Nome, CPF ou telefone..."
            className="input pl-9" />
        </div>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner /> : (
          <>
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="th">Nome</th>
                  <th className="th">CPF</th>
                  <th className="th">Telefone</th>
                  <th className="th">Cidade</th>
                  <th className="th text-right">Limite Crédito</th>
                  <th className="th w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {clientes.map((c: any) => (
                  <tr key={c.id} className="tr-hover group">
                    <td className="td">
                      <p className="text-body-sm font-medium text-on-surface">{c.nome}</p>
                      {c.observacoes && <p className="text-label-md text-on-surface-variant truncate max-w-xs">{c.observacoes}</p>}
                    </td>
                    <td className="td text-data-mono text-on-surface-variant">{c.cpf || '—'}</td>
                    <td className="td text-body-sm text-on-surface-variant">{c.telefone || c.whatsapp || '—'}</td>
                    <td className="td text-body-sm text-on-surface-variant">{c.cidade || '—'}</td>
                    <td className="td text-right text-data-mono">
                      {Number(c.limiteCredito) > 0 ? (
                        <span className="text-success font-semibold">R$ {Number(c.limiteCredito).toFixed(2)}</span>
                      ) : '—'}
                    </td>
                    <td className="td">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button onClick={() => abrirEditar(c)} className="p-1 text-primary hover:bg-surface-container-low rounded">
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button onClick={() => { if (confirm('Remover cliente?')) remover.mutate(c.id); }}
                          className="p-1 text-error hover:bg-error-container rounded">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {clientes.length === 0 && (
                  <tr><td colSpan={6} className="py-12 text-center text-on-surface-variant text-body-sm">Nenhum cliente encontrado</td></tr>
                )}
              </tbody>
            </table>
            <div className="px-md py-sm border-t border-outline-variant flex items-center justify-between bg-surface">
              <span className="text-body-sm text-on-surface-variant">{total} cliente(s) · Pág. {page}/{totalPages || 1}</span>
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

      {/* Modal cadastro */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditando(null); }}
        title={editando ? 'Editar Cliente' : 'Novo Cliente'} size="lg">
        <form onSubmit={handleSubmit((d) => salvar.mutate(d))} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Nome *</label>
            <input {...register('nome')} className="input" placeholder="Nome completo" />
            {errors.nome && <p className="text-error text-body-sm mt-1">{errors.nome.message}</p>}
          </div>
          <div>
            <label className="label">CPF</label>
            <input {...register('cpf')} className="input" placeholder="000.000.000-00" />
          </div>
          <div>
            <label className="label">Telefone</label>
            <input {...register('telefone')} className="input" placeholder="(00) 00000-0000" />
          </div>
          <div>
            <label className="label">WhatsApp</label>
            <input {...register('whatsapp')} className="input" placeholder="(00) 00000-0000" />
          </div>
          <div>
            <label className="label">Limite de Crédito (R$)</label>
            <input {...register('limiteCredito')} type="number" step="0.01" min="0" className="input" />
          </div>
          <div>
            <label className="label">Endereço</label>
            <input {...register('endereco')} className="input" placeholder="Rua, número" />
          </div>
          <div>
            <label className="label">Bairro</label>
            <input {...register('bairro')} className="input" />
          </div>
          <div className="col-span-2">
            <label className="label">Cidade</label>
            <input {...register('cidade')} className="input" />
          </div>
          <div className="col-span-2">
            <label className="label">Observações</label>
            <textarea {...register('observacoes')} className="input h-16 resize-none" />
          </div>
          <div className="col-span-2 flex justify-end gap-sm pt-2 border-t border-outline-variant">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={salvar.isPending} className="btn-success">
              {salvar.isPending ? 'Salvando...' : 'Salvar Cliente'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
