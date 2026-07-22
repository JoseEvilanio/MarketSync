import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { caixaService } from '@/services/api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const tipoLabel: Record<string, string> = {
  ABERTURA: 'Abertura', SUPRIMENTO: 'Suprimento', SANGRIA: 'Sangria',
  VENDA: 'Venda', DEVOLUCAO: 'Devolução', FECHAMENTO: 'Fechamento',
};

export default function CaixaPage() {
  const qc = useQueryClient();
  const [modalAbrir, setModalAbrir] = useState(false);
  const [modalFechar, setModalFechar] = useState(false);
  const [modalSangria, setModalSangria] = useState(false);
  const [modalSuprimento, setModalSuprimento] = useState(false);

  const { data: caixa, isLoading } = useQuery({
    queryKey: ['caixa-atual'],
    queryFn: caixaService.atual,
    refetchInterval: 30_000,
  });

  const { register: regAbrir, handleSubmit: hsAbrir, reset: rstAbrir } = useForm<any>();
  const { register: regFechar, handleSubmit: hsFechar, reset: rstFechar } = useForm<any>();
  const { register: regSangria, handleSubmit: hsSangria, reset: rstSangria } = useForm<any>();
  const { register: regSup, handleSubmit: hsSup, reset: rstSup } = useForm<any>();

  const abrir = useMutation({
    mutationFn: (d: any) => caixaService.abrir(Number(d.valorAbertura)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['caixa-atual'] }); toast.success('Caixa aberto!'); setModalAbrir(false); rstAbrir(); },
  });

  const fechar = useMutation({
    mutationFn: (d: any) => caixaService.fechar({ caixaId: caixa!.id, valorContado: Number(d.valorContado), observacoes: d.observacoes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['caixa-atual'] }); toast.success('Caixa fechado!'); setModalFechar(false); rstFechar(); },
  });

  const sangria = useMutation({
    mutationFn: (d: any) => caixaService.sangria({ caixaId: caixa!.id, valor: Number(d.valor), descricao: d.descricao }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['caixa-atual'] }); toast.success('Sangria registrada!'); setModalSangria(false); rstSangria(); },
  });

  const suprimento = useMutation({
    mutationFn: (d: any) => caixaService.suprimento({ caixaId: caixa!.id, valor: Number(d.valor), descricao: d.descricao }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['caixa-atual'] }); toast.success('Suprimento registrado!'); setModalSuprimento(false); rstSup(); },
  });

  if (isLoading) return <LoadingSpinner />;

  // Calcular totais do caixa atual
  const movimentos = caixa?.movimentos || [];
  const totalEntradas = movimentos.filter((m: any) => ['ABERTURA', 'SUPRIMENTO', 'VENDA'].includes(m.tipo))
    .reduce((a: number, m: any) => a + Number(m.valor), 0);
  const totalSaidas = movimentos.filter((m: any) => ['SANGRIA', 'DEVOLUCAO'].includes(m.tipo))
    .reduce((a: number, m: any) => a + Number(m.valor), 0);
  const totalVendas = movimentos.filter((m: any) => m.tipo === 'VENDA')
    .reduce((a: number, m: any) => a + Number(m.valor), 0);
  const saldoAtual = totalEntradas - totalSaidas;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-md gap-md">
        <div>
          <h3 className="text-headline-lg text-on-surface">Gerenciamento de Caixa</h3>
        </div>
        {!caixa ? (
          <button onClick={() => setModalAbrir(true)} className="btn-success">
            <span className="material-symbols-outlined text-[18px]">lock_open</span>
            Abrir Caixa
          </button>
        ) : (
          <div className="flex gap-sm">
            <button onClick={() => setModalSangria(true)} className="btn-outline">
              <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
              Sangria
            </button>
            <button onClick={() => setModalSuprimento(true)} className="btn-outline">
              <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
              Suprimento
            </button>
            <button onClick={() => setModalFechar(true)} className="btn-danger">
              <span className="material-symbols-outlined text-[18px]">lock</span>
              Fechar Caixa
            </button>
          </div>
        )}
      </div>

      {!caixa ? (
        <div className="card p-xl text-center">
          <span className="material-symbols-outlined text-[64px] text-on-surface-variant">account_balance_wallet</span>
          <h3 className="text-headline-md text-on-surface mt-md">Nenhum caixa aberto</h3>
          <p className="text-body-md text-on-surface-variant mt-xs mb-md">Abra o caixa para começar a registrar vendas.</p>
          <button onClick={() => setModalAbrir(true)} className="btn-success mx-auto">
            <span className="material-symbols-outlined text-[18px]">lock_open</span>
            Abrir Caixa Agora
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
          {/* Resumo */}
          <div className="lg:col-span-1 space-y-md">
            <div className="card p-md bg-success-container border-success/30">
              <p className="text-label-md text-[#166534] uppercase mb-xs">Saldo Atual em Caixa</p>
              <p className="text-display-price font-black text-[#166534]">{formatCurrency(saldoAtual)}</p>
              <p className="text-body-sm text-[#166534]/70 mt-xs">
                Aberto em {formatDateTime(caixa.aberturaEm)}
              </p>
            </div>
            <div className="card p-md">
              <p className="text-label-md text-on-surface-variant uppercase mb-sm">Resumo do Caixa</p>
              <div className="space-y-sm">
                <div className="flex justify-between text-body-md">
                  <span className="text-on-surface-variant">Abertura</span>
                  <span className="font-semibold">{formatCurrency(caixa.valorAbertura)}</span>
                </div>
                <div className="flex justify-between text-body-md">
                  <span className="text-on-surface-variant">Vendas</span>
                  <span className="font-semibold text-success">{formatCurrency(totalVendas)}</span>
                </div>
                <div className="flex justify-between text-body-md">
                  <span className="text-on-surface-variant">Suprimentos</span>
                  <span className="font-semibold text-success">
                    {formatCurrency(movimentos.filter((m: any) => m.tipo === 'SUPRIMENTO').reduce((a: number, m: any) => a + Number(m.valor), 0))}
                  </span>
                </div>
                <div className="flex justify-between text-body-md">
                  <span className="text-on-surface-variant">Sangrias</span>
                  <span className="font-semibold text-error">
                    {formatCurrency(movimentos.filter((m: any) => m.tipo === 'SANGRIA').reduce((a: number, m: any) => a + Number(m.valor), 0))}
                  </span>
                </div>
                <div className="h-px bg-outline-variant" />
                <div className="flex justify-between text-body-lg font-bold">
                  <span>Saldo</span>
                  <span className="text-success">{formatCurrency(saldoAtual)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Movimentos */}
          <div className="lg:col-span-2 card overflow-hidden flex flex-col max-h-[600px]">
            <div className="p-md border-b border-outline-variant bg-[#f1f5f9] flex justify-between items-center">
              <h4 className="text-headline-md text-on-surface">Movimentos do Caixa</h4>
              <span className="badge badge-success">Aberto</span>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full">
                <thead className="table-header sticky top-0">
                  <tr>
                    <th className="th">Hora</th>
                    <th className="th">Tipo</th>
                    <th className="th">Descrição</th>
                    <th className="th text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {movimentos.map((m: any) => {
                    const isEntrada = ['ABERTURA', 'SUPRIMENTO', 'VENDA'].includes(m.tipo);
                    return (
                      <tr key={m.id} className="tr-hover">
                        <td className="td text-body-sm text-on-surface-variant whitespace-nowrap">
                          {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="td">
                          <span className={`badge ${isEntrada ? 'badge-success' : 'badge-error'}`}>
                            {tipoLabel[m.tipo]}
                          </span>
                        </td>
                        <td className="td text-body-sm text-on-surface-variant">{m.descricao || '—'}</td>
                        <td className={`td text-right text-data-mono font-bold ${isEntrada ? 'text-success' : 'text-error'}`}>
                          {isEntrada ? '+' : '-'}{formatCurrency(m.valor)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal abrir caixa */}
      <Modal open={modalAbrir} onClose={() => setModalAbrir(false)} title="Abrir Caixa" size="sm">
        <form onSubmit={hsAbrir((d) => abrir.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Valor de Abertura (R$)</label>
            <input {...regAbrir('valorAbertura', { required: true, valueAsNumber: true })}
              type="number" step="0.01" min="0" className="input-lg text-center text-xl font-bold" placeholder="0,00" autoFocus />
          </div>
          <div className="flex justify-end gap-sm border-t border-outline-variant pt-4">
            <button type="button" onClick={() => setModalAbrir(false)} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={abrir.isPending} className="btn-success">
              <span className="material-symbols-outlined text-[18px]">lock_open</span>
              Abrir Caixa
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal fechar caixa */}
      <Modal open={modalFechar} onClose={() => setModalFechar(false)} title="Fechar Caixa">
        <form onSubmit={hsFechar((d) => fechar.mutate(d))} className="space-y-4">
          <div className="bg-surface-container-low rounded-lg p-md">
            <p className="text-label-md text-on-surface-variant uppercase mb-xs">Valor Esperado</p>
            <p className="text-headline-lg font-bold text-on-surface">{formatCurrency(saldoAtual)}</p>
          </div>
          <div>
            <label className="label">Valor Contado (R$) *</label>
            <input {...regFechar('valorContado', { required: true, valueAsNumber: true })}
              type="number" step="0.01" min="0" className="input-lg text-center text-xl font-bold" placeholder="0,00" autoFocus />
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea {...regFechar('observacoes')} className="input h-20 resize-none" placeholder="Observações do fechamento..." />
          </div>
          <div className="flex justify-end gap-sm border-t border-outline-variant pt-4">
            <button type="button" onClick={() => setModalFechar(false)} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={fechar.isPending} className="btn-danger">
              <span className="material-symbols-outlined text-[18px]">lock</span>
              Confirmar Fechamento
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal sangria */}
      <Modal open={modalSangria} onClose={() => setModalSangria(false)} title="Sangria de Caixa" size="sm">
        <form onSubmit={hsSangria((d) => sangria.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Valor (R$)</label>
            <input {...regSangria('valor', { required: true, valueAsNumber: true })}
              type="number" step="0.01" min="0.01" className="input-lg text-center" placeholder="0,00" autoFocus />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input {...regSangria('descricao')} className="input" placeholder="Motivo da sangria..." />
          </div>
          <div className="flex justify-end gap-sm border-t border-outline-variant pt-4">
            <button type="button" onClick={() => setModalSangria(false)} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={sangria.isPending} className="btn-primary">Registrar Sangria</button>
          </div>
        </form>
      </Modal>

      {/* Modal suprimento */}
      <Modal open={modalSuprimento} onClose={() => setModalSuprimento(false)} title="Suprimento de Caixa" size="sm">
        <form onSubmit={hsSup((d) => suprimento.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Valor (R$)</label>
            <input {...regSup('valor', { required: true, valueAsNumber: true })}
              type="number" step="0.01" min="0.01" className="input-lg text-center" placeholder="0,00" autoFocus />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input {...regSup('descricao')} className="input" placeholder="Motivo do suprimento..." />
          </div>
          <div className="flex justify-end gap-sm border-t border-outline-variant pt-4">
            <button type="button" onClick={() => setModalSuprimento(false)} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={suprimento.isPending} className="btn-success">Registrar Suprimento</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
