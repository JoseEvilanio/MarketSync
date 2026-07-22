import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { configuracoesService, authSenhaService } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';

// ── Schemas ─────────────────────────────────────────────────────────────────

const schemaLoja = z.object({
  loja_nome:       z.string().min(1, 'Nome da loja obrigatório'),
  loja_cnpj:       z.string().optional(),
  loja_telefone:   z.string().optional(),
  loja_endereco:   z.string().optional(),
  loja_cidade:     z.string().optional(),
  loja_bairro:     z.string().optional(),
  loja_cep:        z.string().optional(),
  loja_ie:         z.string().optional(),
});

const schemaCupom = z.object({
  cupom_rodape:         z.string().optional(),
  cupom_mostrar_cnpj:   z.enum(['true', 'false']),
  cupom_mostrar_logo:   z.enum(['true', 'false']),
  cupom_largura:        z.enum(['58', '80']),
});

const schemaSenha = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual'),
  novaSenha:  z.string().min(6, 'Nova senha deve ter ao menos 6 caracteres'),
  confirmar:  z.string().min(6),
}).refine((d) => d.novaSenha === d.confirmar, {
  message: 'As senhas não conferem',
  path: ['confirmar'],
});

type FormLoja   = z.infer<typeof schemaLoja>;
type FormCupom  = z.infer<typeof schemaCupom>;
type FormSenha  = z.infer<typeof schemaSenha>;

// ── Componente ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'loja',   label: 'Dados da Loja',  icon: 'storefront' },
  { id: 'cupom',  label: 'Cupom / Impressão', icon: 'receipt_long' },
  { id: 'senha',  label: 'Minha Senha',    icon: 'lock' },
] as const;
type TabId = typeof TABS[number]['id'];

export default function ConfiguracoesPage() {
  const qc = useQueryClient();
  const usuario = useAuthStore((s) => s.usuario);
  const [tab, setTab] = useState<TabId>('loja');

  const { data: configs, isLoading } = useQuery({
    queryKey: ['configuracoes'],
    queryFn: () => configuracoesService.listar(),
  });

  // ── Form: Loja ─────────────────────────────────────
  const formLoja = useForm<FormLoja>({ resolver: zodResolver(schemaLoja) });

  useEffect(() => {
    if (!configs) return;
    formLoja.reset({
      loja_nome:     configs.loja_nome     ?? '',
      loja_cnpj:     configs.loja_cnpj     ?? '',
      loja_telefone: configs.loja_telefone ?? '',
      loja_endereco: configs.loja_endereco ?? '',
      loja_cidade:   configs.loja_cidade   ?? '',
      loja_bairro:   configs.loja_bairro   ?? '',
      loja_cep:      configs.loja_cep      ?? '',
      loja_ie:       configs.loja_ie       ?? '',
    });
  }, [configs]);

  const salvarLoja = useMutation({
    mutationFn: (d: FormLoja) => configuracoesService.atualizar(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracoes'] });
      toast.success('Dados da loja salvos');
    },
    onError: () => toast.error('Erro ao salvar configurações'),
  });

  // ── Form: Cupom ────────────────────────────────────
  const formCupom = useForm<FormCupom>({ resolver: zodResolver(schemaCupom) });

  useEffect(() => {
    if (!configs) return;
    formCupom.reset({
      cupom_rodape:       configs.cupom_rodape       ?? '',
      cupom_mostrar_cnpj: (configs.cupom_mostrar_cnpj ?? 'true') as 'true' | 'false',
      cupom_mostrar_logo: (configs.cupom_mostrar_logo ?? 'false') as 'true' | 'false',
      cupom_largura:      (configs.cupom_largura      ?? '80')  as '58' | '80',
    });
  }, [configs]);

  const salvarCupom = useMutation({
    mutationFn: (d: FormCupom) => configuracoesService.atualizar(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracoes'] });
      toast.success('Configurações de cupom salvas');
    },
    onError: () => toast.error('Erro ao salvar configurações'),
  });

  // ── Form: Senha ────────────────────────────────────
  const formSenha = useForm<FormSenha>({ resolver: zodResolver(schemaSenha) });
  const [showSenha, setShowSenha] = useState(false);

  const alterarSenha = useMutation({
    mutationFn: (d: FormSenha) =>
      authSenhaService.alterar({ senhaAtual: d.senhaAtual, novaSenha: d.novaSenha }),
    onSuccess: () => {
      toast.success('Senha alterada com sucesso');
      formSenha.reset();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.erro || 'Erro ao alterar senha');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-md">
        <h3 className="text-headline-lg text-on-surface">Configurações</h3>
        <p className="text-body-md text-on-surface-variant mt-xs">
          Parâmetros gerais do sistema MarketSync
        </p>
      </div>

      {/* Abas */}
      <div className="flex gap-xs mb-lg border-b border-outline-variant">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-xs px-md py-sm text-body-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Aba: Dados da Loja ──────────────────────── */}
      {tab === 'loja' && (
        <form onSubmit={formLoja.handleSubmit((d) => salvarLoja.mutate(d))}>
          <div className="card p-lg space-y-4">
            <h4 className="text-headline-md text-on-surface font-semibold flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary">storefront</span>
              Identificação da Loja
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Nome da Loja *</label>
                <input
                  {...formLoja.register('loja_nome')}
                  className="input"
                  placeholder="Ex: Mercadinho do João"
                />
                {formLoja.formState.errors.loja_nome && (
                  <p className="text-error text-label-md mt-1">
                    {formLoja.formState.errors.loja_nome.message}
                  </p>
                )}
              </div>

              <div>
                <label className="label">CNPJ</label>
                <input
                  {...formLoja.register('loja_cnpj')}
                  className="input"
                  placeholder="00.000.000/0001-00"
                />
              </div>

              <div>
                <label className="label">Inscrição Estadual</label>
                <input
                  {...formLoja.register('loja_ie')}
                  className="input"
                  placeholder="000.000.000.000"
                />
              </div>

              <div>
                <label className="label">Telefone</label>
                <input
                  {...formLoja.register('loja_telefone')}
                  className="input"
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div>
                <label className="label">CEP</label>
                <input
                  {...formLoja.register('loja_cep')}
                  className="input"
                  placeholder="00000-000"
                />
              </div>

              <div className="col-span-2">
                <label className="label">Endereço</label>
                <input
                  {...formLoja.register('loja_endereco')}
                  className="input"
                  placeholder="Rua, número, complemento"
                />
              </div>

              <div>
                <label className="label">Bairro</label>
                <input
                  {...formLoja.register('loja_bairro')}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Cidade</label>
                <input
                  {...formLoja.register('loja_cidade')}
                  className="input"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-outline-variant">
              <button type="submit" disabled={salvarLoja.isPending} className="btn-primary">
                <span className="material-symbols-outlined text-[18px]">save</span>
                {salvarLoja.isPending ? 'Salvando...' : 'Salvar Dados'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Aba: Cupom / Impressão ──────────────────── */}
      {tab === 'cupom' && (
        <form onSubmit={formCupom.handleSubmit((d) => salvarCupom.mutate(d))}>
          <div className="card p-lg space-y-4">
            <h4 className="text-headline-md text-on-surface font-semibold flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary">receipt_long</span>
              Configurações de Impressão
            </h4>

            <div>
              <label className="label">Largura do Papel</label>
              <div className="flex gap-sm mt-1">
                {(['58', '80'] as const).map((w) => (
                  <label
                    key={w}
                    className={`flex-1 flex items-center justify-center gap-sm p-md rounded-lg border-2 cursor-pointer transition-colors ${
                      formCupom.watch('cupom_largura') === w
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-outline-variant hover:border-primary/50'
                    }`}
                  >
                    <input
                      type="radio"
                      value={w}
                      {...formCupom.register('cupom_largura')}
                      className="sr-only"
                    />
                    <span className="material-symbols-outlined text-[20px]">receipt</span>
                    <span className="text-body-sm font-medium">{w}mm</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Mensagem no Rodapé do Cupom</label>
              <textarea
                {...formCupom.register('cupom_rodape')}
                className="input min-h-[80px] resize-none"
                placeholder="Ex: Obrigado pela preferência! Volte sempre."
              />
            </div>

            <div className="space-y-3">
              <label className="label">Opções de Exibição</label>

              {(
                [
                  { field: 'cupom_mostrar_cnpj' as const, label: 'Exibir CNPJ no cupom' },
                  { field: 'cupom_mostrar_logo' as const, label: 'Exibir logotipo no cupom' },
                ] as const
              ).map(({ field, label }) => {
                const checked = formCupom.watch(field) === 'true';
                return (
                  <label key={field} className="flex items-center gap-sm cursor-pointer">
                    <div
                      role="switch"
                      aria-checked={checked}
                      onClick={() => formCupom.setValue(field, checked ? 'false' : 'true')}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                        checked ? 'bg-primary' : 'bg-surface-container-high'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          checked ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </div>
                    <span className="text-body-sm text-on-surface">{label}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end pt-2 border-t border-outline-variant">
              <button type="submit" disabled={salvarCupom.isPending} className="btn-primary">
                <span className="material-symbols-outlined text-[18px]">save</span>
                {salvarCupom.isPending ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Aba: Minha Senha ────────────────────────── */}
      {tab === 'senha' && (
        <div className="card p-lg">
          <h4 className="text-headline-md text-on-surface font-semibold flex items-center gap-sm mb-lg">
            <span className="material-symbols-outlined text-primary">lock</span>
            Alterar Senha
          </h4>

          <div className="flex items-center gap-md p-md bg-surface-container-low rounded-lg mb-lg">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-on-primary text-headline-md font-bold">
                {usuario?.nome?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-body-md font-semibold text-on-surface">{usuario?.nome}</p>
              <p className="text-body-sm text-on-surface-variant">{usuario?.email}</p>
              <span className="text-[11px] font-bold text-primary">{usuario?.perfil}</span>
            </div>
          </div>

          <form
            onSubmit={formSenha.handleSubmit((d) => alterarSenha.mutate(d))}
            className="space-y-4 max-w-sm"
          >
            <div>
              <label className="label">Senha Atual *</label>
              <div className="relative">
                <input
                  {...formSenha.register('senhaAtual')}
                  type={showSenha ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showSenha ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              {formSenha.formState.errors.senhaAtual && (
                <p className="text-error text-label-md mt-1">
                  {formSenha.formState.errors.senhaAtual.message}
                </p>
              )}
            </div>

            <div>
              <label className="label">Nova Senha *</label>
              <input
                {...formSenha.register('novaSenha')}
                type={showSenha ? 'text' : 'password'}
                className="input"
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
              {formSenha.formState.errors.novaSenha && (
                <p className="text-error text-label-md mt-1">
                  {formSenha.formState.errors.novaSenha.message}
                </p>
              )}
            </div>

            <div>
              <label className="label">Confirmar Nova Senha *</label>
              <input
                {...formSenha.register('confirmar')}
                type={showSenha ? 'text' : 'password'}
                className="input"
                placeholder="Repita a nova senha"
                autoComplete="new-password"
              />
              {formSenha.formState.errors.confirmar && (
                <p className="text-error text-label-md mt-1">
                  {formSenha.formState.errors.confirmar.message}
                </p>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-outline-variant">
              <button
                type="submit"
                disabled={alterarSenha.isPending}
                className="btn-primary"
              >
                <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                {alterarSenha.isPending ? 'Alterando...' : 'Alterar Senha'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
