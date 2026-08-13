/**
 * ModalCaixa — gerenciamento de caixa embutido no PDV.
 * Abre/fecha caixa, sangria e suprimento sem sair da tela.
 * Quando o caixa está fechado, abre direto no sub-modal de abertura.
 */
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { caixaService } from '@/services/api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import Modal from '@/components/ui/Modal';

const tipoLabel: Record<string, string> = {
  ABERTURA: 'Abertura', SUPRIMENTO: 'Suprimento', SANGRIA: 'Sangria',
  VENDA: 'Venda', DEVOLUCAO: 'Devolução', FECHAMENTO: 'Fechamento',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

type SubModal = 'abrir' | 'fechar' | 'sangria' | 'suprimento' | null;

export default function ModalCaixa({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [sub, setSub] = useState<SubModal>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: caixa, isLoading } = useQuery({
    queryKey: ['caixa-atual'],
    queryFn: caixaService.atual,
    enabled: open,
    refetchInterval: open ? 30_000 : false,
  });

  // Se abriu via F7 e caixa está fechado → vai direto pro formulário de abertura
  useEffect(() => {
    if (open && !isLoading && !caixa) {
      setSub('abrir');
    }
    if (!open) {
      setSub(null);
    } else {
      // Tirar o foco do input do fundo (PDV) e focar o container do modal imediatamente
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setTimeout(() => {
        containerRef.current?.focus();
      }, 50);
    }
  }, [open, isLoading, caixa, sub]);

  // Atalhos de teclado no modal principal do caixa (1, 2, 3)
  useEffect(() => {
    if (!open || sub !== null) return;

    function handleKey(e: KeyboardEvent) {
      const active = document.activeElement as HTMLElement;
      // Se o foco estiver em um input dentro do sub-modal, não interceptar
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
        const isInsideSubModal = active.closest('form');
        if (isInsideSubModal) return;
      }

      switch (e.key) {
        case '1': e.preventDefault(); if (caixa) setSub('sangria'); break;
        case '2': e.preventDefault(); if (caixa) setSub('suprimento'); break;
        case '3': e.preventDefault(); if (caixa) setSub('fechar'); break;
        case 'Escape': e.preventDefault(); onClose(); break;
      }
    }

    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [open, sub, caixa, onClose]);

  const { register: regAbrir, handleSubmit: hsAbrir, reset: rstAbrir } = useForm<any>();
  const { register: regFechar, handleSubmit: hsFechar, reset: rstFechar } = useForm<any>();
  const { register: regSangria, handleSubmit: hsSangria, reset: rstSangria } = useForm<any>();
  const { register: regSup, handleSubmit: hsSup, reset: rstSup } = useForm<any>();

  const invalidar = () => qc.invalidateQueries({ queryKey: ['caixa-atual'] });

  const abrir = useMutation({
    mutationFn: (d: any) => caixaService.abrir(Number(d.valorAbertura)),
    onSuccess: () => { invalidar(); toast.success('Caixa aberto!'); setSub(null); rstAbrir(); },
    onError: () => toast.error('Erro ao abrir caixa'),
  });

  const fechar = useMutation({
    mutationFn: (d: any) =>
      caixaService.fechar({ caixaId: caixa!.id, valorContado: Number(d.valorContado), observacoes: d.observacoes }),
    onSuccess: () => { invalidar(); toast.success('Caixa fechado!'); setSub(null); rstFechar(); },
    onError: () => toast.error('Erro ao fechar caixa'),
  });

  const sangria = useMutation({
    mutationFn: (d: any) =>
      caixaService.sangria({ caixaId: caixa!.id, valor: Number(d.valor), descricao: d.descricao }),
    onSuccess: () => { invalidar(); toast.success('Sangria registrada!'); setSub(null); rstSangria(); },
    onError: () => toast.error('Erro ao registrar sangria'),
  });

  const suprimento = useMutation({
    mutationFn: (d: any) =>
      caixaService.suprimento({ caixaId: caixa!.id, valor: Number(d.valor), descricao: d.descricao }),
    onSuccess: () => { invalidar(); toast.success('Suprimento registrado!'); setSub(null); rstSup(); },
    onError: () => toast.error('Erro ao registrar suprimento'),
  });

  // Calcular saldo
  const movimentos = caixa?.movimentos ?? [];
  const totalEntradas = movimentos
    .filter((m: any) => ['ABERTURA', 'SUPRIMENTO', 'VENDA'].includes(m.tipo))
    .reduce((a: number, m: any) => a + Number(m.valor), 0);
  const totalSaidas = movimentos
    .filter((m: any) => ['SANGRIA', 'DEVOLUCAO'].includes(m.tipo))
    .reduce((a: number, m: any) => a + Number(m.valor), 0);
  const totalVendas = movimentos
    .filter((m: any) => m.tipo === 'VENDA')
    .reduce((a: number, m: any) => a + Number(m.valor), 0);
  const saldoAtual = totalEntradas - totalSaidas;

  return (
    <>
      {/* ── Modal principal do caixa ── */}
      <Modal open={open && !sub} onClose={onClose} title="Caixa (F7)" size="lg">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !caixa ? (
          /* Caixa fechado */
          <div className="flex flex-col items-center gap-lg py-md text-center">
            <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center">
              <span className="material-symbols-outlined text-error text-[36px]">lock</span>
            </div>
            <div>
              <h3 className="text-headline-md font-bold text-on-surface">Caixa Fechado</h3>
              <p className="text-body-md text-on-surface-variant mt-xs">
                Abra o caixa para registrar vendas.
              </p>
            </div>
            <button onClick={() => setSub('abrir')} className="btn-success px-xl">
              <span className="material-symbols-outlined text-[18px]">lock_open</span>
              Abrir Caixa
            </button>
          </div>
        ) : (
          /* Caixa aberto */
          <div ref={containerRef} tabIndex={-1} className="space-y-md outline-none">
            {/* Status */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-sm">
              <div className="card p-md bg-success/10 border-success/20 text-center">
                <p className="text-label-md text-on-surface-variant uppercase">Saldo</p>
                <p className="text-headline-md font-black text-success">{formatCurrency(saldoAtual)}</p>
              </div>
              <div className="card p-md text-center">
                <p className="text-label-md text-on-surface-variant uppercase">Vendas</p>
                <p className="text-headline-md font-bold text-on-surface">{formatCurrency(totalVendas)}</p>
              </div>
              <div className="card p-md text-center">
                <p className="text-label-md text-on-surface-variant uppercase">Sangrias</p>
                <p className="text-headline-md font-bold text-error">
                  {formatCurrency(movimentos.filter((m: any) => m.tipo === 'SANGRIA').reduce((a: number, m: any) => a + Number(m.valor), 0))}
                </p>
              </div>
              <div className="card p-md text-center">
                <p className="text-label-md text-on-surface-variant uppercase">Abertura</p>
                <p className="text-headline-md font-bold text-on-surface">{formatCurrency(caixa.valorAbertura)}</p>
              </div>
            </div>

            <p className="text-body-sm text-on-surface-variant">
              Aberto em {formatDateTime(caixa.aberturaEm)} · por {caixa.usuario?.nome}
            </p>

            {/* Ações */}
            <div className="flex gap-sm flex-wrap">
              <button
                onClick={() => setSub('sangria')}
                className="btn-outline flex-1 !justify-between"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                  Sangria
                </span>
                <span className="text-[10px] text-on-surface-variant">(opção 1)</span>
              </button>

              <button
                onClick={() => setSub('suprimento')}
                className="btn-outline flex-1 !justify-between"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                  Suprimento
                </span>
                <span className="text-[10px] text-on-surface-variant">(opção 2)</span>
              </button>

              <button
                onClick={() => setSub('fechar')}
                className="btn-danger flex-1 !justify-between"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                  Fechar Caixa
                </span>
                <span className="text-[10px] text-white/80">(opção 3)</span>
              </button>
            </div>

            {/* Últimos movimentos */}
            {movimentos.length > 0 && (
              <div className="border border-outline-variant rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-body-sm">
                  <thead className="bg-surface-container-low sticky top-0">
                    <tr>
                      <th className="th text-left px-md py-sm">Hora</th>
                      <th className="th text-left px-md py-sm">Tipo</th>
                      <th className="th text-left px-md py-sm">Descrição</th>
                      <th className="th text-right px-md py-sm">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {[...movimentos].reverse().map((m: any) => {
                      const isEntrada = ['ABERTURA', 'SUPRIMENTO', 'VENDA'].includes(m.tipo);
                      return (
                        <tr key={m.id}>
                          <td className="px-md py-sm text-on-surface-variant whitespace-nowrap">
                            {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-md py-sm">
                            <span className={`badge text-[10px] ${isEntrada ? 'badge-success' : 'badge-error'}`}>
                              {tipoLabel[m.tipo]}
                            </span>
                          </td>
                          <td className="px-md py-sm text-on-surface-variant">{m.descricao || '—'}</td>
                          <td className={`px-md py-sm text-right font-bold text-data-mono ${isEntrada ? 'text-success' : 'text-error'}`}>
                            {isEntrada ? '+' : '-'}{formatCurrency(m.valor)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Sub-modal: Abrir caixa ── */}
      <Modal open={sub === 'abrir'} onClose={() => { setSub(null); if (!caixa) onClose(); }} title="Abrir Caixa" size="sm">
        <form onSubmit={hsAbrir((d) => abrir.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Valor de Abertura (R$) *</label>
            <input
              {...regAbrir('valorAbertura', { required: true, valueAsNumber: true })}
              type="number" step="0.01" min="0"
              className="input-lg text-center text-xl font-bold"
              placeholder="0,00"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-sm pt-2 border-t border-outline-variant">
            <button type="button" onClick={() => { setSub(null); if (!caixa) onClose(); }} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={abrir.isPending} className="btn-success">
              <span className="material-symbols-outlined text-[18px]">lock_open</span>
              {abrir.isPending ? 'Abrindo...' : 'Abrir Caixa'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Sub-modal: Fechar caixa ── */}
      <Modal open={sub === 'fechar'} onClose={() => setSub(null)} title="Fechar Caixa">
        <form onSubmit={hsFechar((d) => fechar.mutate(d))} className="space-y-4">
          <div className="bg-surface-container-low rounded-lg p-md">
            <p className="text-label-md text-on-surface-variant uppercase mb-xs">Valor Esperado em Caixa</p>
            <p className="text-headline-lg font-black text-on-surface">{formatCurrency(saldoAtual)}</p>
          </div>
          <div>
            <label className="label">Valor Contado (R$) *</label>
            <input
              {...regFechar('valorContado', { required: true, valueAsNumber: true })}
              type="number" step="0.01" min="0"
              className="input-lg text-center text-xl font-bold"
              placeholder="0,00"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea {...regFechar('observacoes')} className="input h-20 resize-none" placeholder="Observações do fechamento..." />
          </div>
          <div className="flex justify-end gap-sm pt-2 border-t border-outline-variant">
            <button type="button" onClick={() => setSub(null)} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={fechar.isPending} className="btn-danger">
              <span className="material-symbols-outlined text-[18px]">lock</span>
              {fechar.isPending ? 'Fechando...' : 'Confirmar Fechamento'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Sub-modal: Sangria ── */}
      <Modal open={sub === 'sangria'} onClose={() => setSub(null)} title="Sangria de Caixa" size="sm">
        <form onSubmit={hsSangria((d) => sangria.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Valor (R$) *</label>
            <input
              {...regSangria('valor', { required: true, valueAsNumber: true })}
              type="number" step="0.01" min="0.01"
              className="input-lg text-center"
              placeholder="0,00"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input {...regSangria('descricao')} className="input" placeholder="Motivo da sangria..." />
          </div>
          <div className="flex justify-end gap-sm pt-2 border-t border-outline-variant">
            <button type="button" onClick={() => setSub(null)} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={sangria.isPending} className="btn-primary">
              {sangria.isPending ? 'Registrando...' : 'Registrar Sangria'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Sub-modal: Suprimento ── */}
      <Modal open={sub === 'suprimento'} onClose={() => setSub(null)} title="Suprimento de Caixa" size="sm">
        <form onSubmit={hsSup((d) => suprimento.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Valor (R$) *</label>
            <input
              {...regSup('valor', { required: true, valueAsNumber: true })}
              type="number" step="0.01" min="0.01"
              className="input-lg text-center"
              placeholder="0,00"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input {...regSup('descricao')} className="input" placeholder="Motivo do suprimento..." />
          </div>
          <div className="flex justify-end gap-sm pt-2 border-t border-outline-variant">
            <button type="button" onClick={() => setSub(null)} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={suprimento.isPending} className="btn-success">
              {suprimento.isPending ? 'Registrando...' : 'Registrar Suprimento'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
