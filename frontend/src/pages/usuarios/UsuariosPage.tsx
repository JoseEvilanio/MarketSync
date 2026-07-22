import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { usuariosService } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { formatDateTime } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const PERFIS = ['ADMINISTRADOR', 'GERENTE', 'CAIXA'] as const;

const schemaCriar = z.object({
  nome:   z.string().min(2, 'Nome obrigatório'),
  email:  z.string().email('E-mail inválido'),
  senha:  z.string().min(6, 'Senha mínima de 6 caracteres'),
  perfil: z.enum(PERFIS),
});

const schemaEditar = z.object({
  nome:   z.string().min(2, 'Nome obrigatório'),
  email:  z.string().email('E-mail inválido'),
  perfil: z.enum(PERFIS),
  ativo:  z.boolean(),
});

type FormCriar = z.infer<typeof schemaCriar>;
type FormEditar = z.infer<typeof schemaEditar>;

const perfilBadge: Record<string, string> = {
  ADMINISTRADOR: 'bg-error-container text-on-error-container',
  GERENTE:       'bg-secondary-container text-on-secondary-container',
  CAIXA:         'bg-surface-container-high text-on-surface-variant',
};

const perfilLabel: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  GERENTE:       'Gerente',
  CAIXA:         'Caixa',
};

export default function UsuariosPage() {
  const qc = useQueryClient();
  const usuarioLogado = useAuthStore((s) => s.usuario);

  const [modalOpen, setModalOpen]   = useState(false);
  const [editando, setEditando]     = useState<any>(null);
  const [confirmarDel, setConfirmarDel] = useState<any>(null);

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => usuariosService.listar(),
  });

  // ─── Formulário criar ───────────────────────────────
  const formCriar = useForm<FormCriar>({
    resolver: zodResolver(schemaCriar),
    defaultValues: { perfil: 'CAIXA' },
  });

  // ─── Formulário editar ──────────────────────────────
  const formEditar = useForm<FormEditar>({
    resolver: zodResolver(schemaEditar),
  });

  // ─── Mutations ──────────────────────────────────────
  const criar = useMutation({
    mutationFn: (d: FormCriar) => usuariosService.criar(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      toast.success('Usuário criado com sucesso');
      setModalOpen(false);
      formCriar.reset({ perfil: 'CAIXA' });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.erro || 'Erro ao criar usuário');
    },
  });

  const atualizar = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormEditar }) =>
      usuariosService.atualizar(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      toast.success('Usuário atualizado');
      setEditando(null);
      formEditar.reset();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.erro || 'Erro ao atualizar usuário');
    },
  });

  const remover = useMutation({
    mutationFn: (id: string) => usuariosService.remover(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      toast.success('Usuário removido');
      setConfirmarDel(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.erro || 'Erro ao remover usuário');
    },
  });

  // ─── Handlers ───────────────────────────────────────
  function abrirEditar(u: any) {
    setEditando(u);
    formEditar.reset({
      nome:   u.nome,
      email:  u.email,
      perfil: u.perfil,
      ativo:  u.ativo,
    });
  }

  function abrirNovo() {
    formCriar.reset({ perfil: 'CAIXA' });
    setModalOpen(true);
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-md">
        <div>
          <h3 className="text-headline-lg text-on-surface">Usuários do Sistema</h3>
          <p className="text-body-md text-on-surface-variant mt-xs">
            {usuarios.length} usuário(s) cadastrado(s)
          </p>
        </div>
        <button onClick={abrirNovo} className="btn-success">
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          Novo Usuário
        </button>
      </div>

      {/* Aviso perfil administrador */}
      <div className="card p-md mb-md flex items-center gap-sm bg-error-container border-error/30">
        <span className="material-symbols-outlined text-error text-[20px]">shield_lock</span>
        <p className="text-body-sm text-on-error-container">
          Esta área é restrita a <strong>Administradores</strong>. Cuidado ao alterar perfis e senhas.
        </p>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="th">Usuário</th>
                <th className="th">E-mail</th>
                <th className="th">Perfil</th>
                <th className="th">Status</th>
                <th className="th">Criado em</th>
                <th className="th w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {usuarios.map((u: any) => {
                const isSelf = u.id === usuarioLogado?.id;
                return (
                  <tr key={u.id} className="tr-hover group">
                    <td className="td">
                      <div className="flex items-center gap-sm">
                        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
                          <span className="text-on-primary text-body-sm font-bold">
                            {u.nome.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-body-sm font-medium text-on-surface">
                            {u.nome}
                            {isSelf && (
                              <span className="ml-2 text-[10px] bg-primary text-on-primary px-1.5 py-0.5 rounded font-bold">
                                VOCÊ
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="td text-body-sm text-on-surface-variant">{u.email}</td>
                    <td className="td">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${perfilBadge[u.perfil]}`}>
                        {perfilLabel[u.perfil]}
                      </span>
                    </td>
                    <td className="td">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        u.ativo
                          ? 'bg-success/15 text-success'
                          : 'bg-error-container text-on-error-container'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.ativo ? 'bg-success' : 'bg-error'}`} />
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="td text-body-sm text-on-surface-variant">
                      {formatDateTime(u.createdAt)}
                    </td>
                    <td className="td">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button
                          onClick={() => abrirEditar(u)}
                          className="p-1 text-primary hover:bg-surface-container-low rounded"
                          title="Editar"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => setConfirmarDel(u)}
                            className="p-1 text-error hover:bg-error-container rounded"
                            title="Remover"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-on-surface-variant text-body-sm">
                    Nenhum usuário encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal Novo Usuário ── */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); formCriar.reset({ perfil: 'CAIXA' }); }}
        title="Novo Usuário"
        size="sm"
      >
        <form onSubmit={formCriar.handleSubmit((d) => criar.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nome completo *</label>
            <input {...formCriar.register('nome')} className="input" placeholder="Ex: João Silva" autoFocus />
            {formCriar.formState.errors.nome && (
              <p className="text-error text-label-md mt-1">{formCriar.formState.errors.nome.message}</p>
            )}
          </div>

          <div>
            <label className="label">E-mail *</label>
            <input {...formCriar.register('email')} type="email" className="input" placeholder="usuario@email.com" />
            {formCriar.formState.errors.email && (
              <p className="text-error text-label-md mt-1">{formCriar.formState.errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="label">Senha *</label>
            <input {...formCriar.register('senha')} type="password" className="input" placeholder="Mínimo 6 caracteres" />
            {formCriar.formState.errors.senha && (
              <p className="text-error text-label-md mt-1">{formCriar.formState.errors.senha.message}</p>
            )}
          </div>

          <div>
            <label className="label">Perfil *</label>
            <select {...formCriar.register('perfil')} className="input">
              {PERFIS.map((p) => (
                <option key={p} value={p}>{perfilLabel[p]}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-sm pt-2 border-t border-outline-variant">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-outline">
              Cancelar
            </button>
            <button type="submit" disabled={criar.isPending} className="btn-success">
              {criar.isPending ? 'Criando...' : 'Criar Usuário'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal Editar Usuário ── */}
      <Modal
        open={!!editando}
        onClose={() => { setEditando(null); formEditar.reset(); }}
        title={`Editar: ${editando?.nome}`}
        size="sm"
      >
        <form onSubmit={formEditar.handleSubmit((d) => atualizar.mutate({ id: editando.id, data: d }))} className="space-y-4">
          <div>
            <label className="label">Nome completo *</label>
            <input {...formEditar.register('nome')} className="input" autoFocus />
            {formEditar.formState.errors.nome && (
              <p className="text-error text-label-md mt-1">{formEditar.formState.errors.nome.message}</p>
            )}
          </div>

          <div>
            <label className="label">E-mail *</label>
            <input {...formEditar.register('email')} type="email" className="input" />
            {formEditar.formState.errors.email && (
              <p className="text-error text-label-md mt-1">{formEditar.formState.errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="label">Perfil *</label>
            <select {...formEditar.register('perfil')} className="input">
              {PERFIS.map((p) => (
                <option key={p} value={p}>{perfilLabel[p]}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-sm">
            <input
              type="checkbox"
              id="ativo-edit"
              {...formEditar.register('ativo')}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="ativo-edit" className="text-body-sm text-on-surface cursor-pointer">
              Usuário ativo
            </label>
          </div>

          <div className="flex justify-end gap-sm pt-2 border-t border-outline-variant">
            <button type="button" onClick={() => setEditando(null)} className="btn-outline">
              Cancelar
            </button>
            <button type="submit" disabled={atualizar.isPending} className="btn-primary">
              {atualizar.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal Confirmar Remoção ── */}
      <Modal
        open={!!confirmarDel}
        onClose={() => setConfirmarDel(null)}
        title="Remover Usuário"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-body-md text-on-surface">
            Tem certeza que deseja remover o usuário{' '}
            <strong className="text-error">{confirmarDel?.nome}</strong>?
            Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-sm pt-2 border-t border-outline-variant">
            <button onClick={() => setConfirmarDel(null)} className="btn-outline">
              Cancelar
            </button>
            <button
              onClick={() => remover.mutate(confirmarDel.id)}
              disabled={remover.isPending}
              className="btn-danger"
            >
              {remover.isPending ? 'Removendo...' : 'Remover'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
