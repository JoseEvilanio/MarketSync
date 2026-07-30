import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { estoqueService, produtosService } from '@/services/api';
import { formatDateTime } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { EntradaMercadoriasModal } from '@/components/compras/EntradaMercadoriasModal';

const TIPOS_ENTRADA = ['ENTRADA_COMPRA', 'ENTRADA_AJUSTE', 'ENTRADA_DEVOLUCAO'];
const TIPOS_SAIDA = ['SAIDA_PERDA', 'SAIDA_CONSUMO', 'SAIDA_AJUSTE'];

const tipoLabel: Record<string, string> = {
  ENTRADA_COMPRA: 'Entrada Compra', ENTRADA_AJUSTE: 'Entrada Ajuste',
  ENTRADA_DEVOLUCAO: 'Devolução', SAIDA_VENDA: 'Saída Venda',
  SAIDA_PERDA: 'Perda', SAIDA_CONSUMO: 'Consumo Interno', SAIDA_AJUSTE: 'Ajuste Saída',
};

export default function EstoquePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'critico' | 'historico' | 'inventario'>('critico');
  const [modalAjuste, setModalAjuste] = useState(false);
  const [modalEntrada, setModalEntrada] = useState(false);
  const [searchHist, setSearchHist] = useState('');

  const { data: critico, isLoading: loadCrit } = useQuery({
    queryKey: ['estoque-critico'],
    queryFn: estoqueService.critico,
    enabled: tab === 'critico',
  });

  const { data: historico, isLoading: loadHist } = useQuery({
    queryKey: ['estoque-historico'],
    queryFn: () => estoqueService.historico({ limit: 50 }),
    enabled: tab === 'historico',
  });

  const { data: inventario, isLoading: loadInv } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => estoqueService.inventario({}),
  });

  const { register, handleSubmit, reset } = useForm<any>();

  const ajustar = useMutation({
    mutationFn: estoqueService.ajustar,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['estoque-critico'] });
      qc.invalidateQueries({ queryKey: ['estoque-historico'] });
      qc.invalidateQueries({ queryKey: ['inventario'] });
      qc.invalidateQueries({ queryKey: ['produtos'] });
      toast.success(`Estoque ajustado: ${res.saldoAntes} → ${res.saldoDepois}`);
      setModalAjuste(false);
      reset();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Erro ao realizar ajuste de estoque';
      toast.error(msg);
    },
  });

  const movHistorico = historico?.data || [];
  const produtosInv = (inventario || []).filter((p: any) =>
    !searchHist || p.nome.toLowerCase().includes(searchHist.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-md gap-md">
        <div>
          <h3 className="text-headline-lg text-on-surface">Controle de Estoque</h3>
        </div>
        <div className="flex gap-sm">
          <button onClick={() => setModalEntrada(true)} className="btn-primary flex items-center gap-1.5 font-bold">
            <span className="material-symbols-outlined text-[20px]">inventory_2</span>
            Dar Entrada de Nota
          </button>
          <button onClick={() => setModalAjuste(true)} className="btn-success flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">add_box</span>
            Ajuste Manual
          </button>
        </div>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-3 gap-md mb-md">
        <div className="card p-md flex items-center gap-md hover:border-primary transition-colors">
          <div className="p-2 bg-error-container rounded-lg">
            <span className="material-symbols-outlined text-error">warning</span>
          </div>
          <div>
            <p className="text-label-md text-on-surface-variant uppercase">Itens Críticos</p>
            <p className="text-headline-md font-bold text-on-surface">{(critico || []).length}</p>
          </div>
        </div>
        <div className="card p-md flex items-center gap-md hover:border-primary transition-colors">
          <div className="p-2 bg-success-container rounded-lg">
            <span className="material-symbols-outlined text-success">add_circle</span>
          </div>
          <div>
            <p className="text-label-md text-on-surface-variant uppercase">Entradas Hoje</p>
            <p className="text-headline-md font-bold text-on-surface">
              {movHistorico.filter((m: any) => m.tipo.startsWith('ENTRADA') &&
                new Date(m.createdAt).toDateString() === new Date().toDateString()).length}
            </p>
          </div>
        </div>
        <div className="card p-md flex items-center gap-md hover:border-primary transition-colors">
          <div className="p-2 bg-surface-container-high rounded-lg">
            <span className="material-symbols-outlined text-on-surface-variant">inventory</span>
          </div>
          <div>
            <p className="text-label-md text-on-surface-variant uppercase">Produtos</p>
            <p className="text-headline-md font-bold text-on-surface">{(inventario || []).length}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-xs mb-md border-b border-outline-variant">
        {(['critico', 'historico', 'inventario'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-md py-sm text-body-md font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t === 'critico' ? 'Estoque Crítico' : t === 'historico' ? 'Histórico' : 'Inventário'}
          </button>
        ))}
      </div>

      {/* Conteúdo por tab */}
      {tab === 'critico' && (
        <div className="card overflow-hidden">
          {loadCrit ? <LoadingSpinner /> : (
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="th">Produto</th>
                  <th className="th text-right">Estoque Mín.</th>
                  <th className="th text-right">Estoque Atual</th>
                  <th className="th text-center">Status</th>
                  <th className="th">Fornecedor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {(critico || []).map((p: any) => (
                  <tr key={p.id} className="tr-hover bg-warning-container/30">
                    <td className="td">
                      <p className="text-body-sm font-medium text-on-surface">{p.nome}</p>
                      <p className="text-label-md text-on-surface-variant">{p.codigoBarras}</p>
                    </td>
                    <td className="td text-right text-data-mono text-on-surface-variant">{p.estoqueMinimo}</td>
                    <td className="td text-right text-data-mono font-bold text-[#b45309]">{p.estoqueAtual}</td>
                    <td className="td text-center">
                      <span className="badge badge-warning">
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                        Crítico
                      </span>
                    </td>
                    <td className="td text-body-sm text-on-surface-variant">{p.fornecedorNome || '—'}</td>
                  </tr>
                ))}
                {(!critico || critico.length === 0) && (
                  <tr><td colSpan={5} className="py-12 text-center text-on-surface-variant text-body-sm">
                    Todos os estoques estão ok
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'historico' && (
        <div className="card overflow-hidden">
          {loadHist ? <LoadingSpinner /> : (
            <>
              <div className="p-md border-b border-outline-variant flex gap-md items-center bg-[#f1f5f9]">
                <h4 className="text-headline-md text-on-surface flex-1">Histórico de Movimentos</h4>
              </div>
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="th">Data/Hora</th>
                    <th className="th">Produto</th>
                    <th className="th">Tipo</th>
                    <th className="th text-right">Qtd</th>
                    <th className="th text-right">Saldo Antes</th>
                    <th className="th text-right">Saldo Depois</th>
                    <th className="th">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {movHistorico.map((m: any) => {
                    const isEntrada = m.tipo.startsWith('ENTRADA');
                    return (
                      <tr key={m.id} className="tr-hover">
                        <td className="td text-body-sm text-on-surface-variant whitespace-nowrap">
                          {formatDateTime(m.createdAt)}
                        </td>
                        <td className="td">
                          <p className="text-body-sm font-medium text-on-surface">{m.produto?.nome}</p>
                        </td>
                        <td className="td">
                          <span className={`badge ${isEntrada ? 'badge-success' : 'badge-error'}`}>
                            {tipoLabel[m.tipo] || m.tipo}
                          </span>
                        </td>
                        <td className={`td text-right text-data-mono font-bold ${isEntrada ? 'text-success' : 'text-error'}`}>
                          {isEntrada ? '+' : '-'}{m.quantidade}
                        </td>
                        <td className="td text-right text-data-mono text-on-surface-variant">{m.saldoAntes}</td>
                        <td className="td text-right text-data-mono font-semibold">{m.saldoDepois}</td>
                        <td className="td text-body-sm text-on-surface-variant">{m.motivo || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === 'inventario' && (
        <div className="card overflow-hidden">
          <div className="p-md border-b border-outline-variant flex gap-md bg-[#f1f5f9]">
            <div className="relative flex-1 max-w-xs">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
              <input value={searchHist} onChange={(e) => setSearchHist(e.target.value)}
                placeholder="Filtrar produtos..."
                className="input pl-9" />
            </div>
          </div>
          {loadInv ? <LoadingSpinner /> : (
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="th">Código</th>
                  <th className="th">Produto</th>
                  <th className="th">Categoria</th>
                  <th className="th">Un.</th>
                  <th className="th text-right">Est. Mín.</th>
                  <th className="th text-right">Est. Atual</th>
                  <th className="th text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {produtosInv.map((p: any) => {
                  const critico = p.estoqueAtual <= 0;
                  const baixo = p.estoqueAtual <= p.estoqueMinimo;
                  return (
                    <tr key={p.id} className={`tr-hover ${critico ? 'bg-error-container/20' : baixo ? 'bg-warning-container/20' : ''}`}>
                      <td className="td text-data-mono text-on-surface-variant text-[12px]">{p.codigoBarras || p.codigoInterno || '—'}</td>
                      <td className="td text-body-sm font-medium text-on-surface">{p.nome}</td>
                      <td className="td text-body-sm text-on-surface-variant">{p.categoria?.nome || '—'}</td>
                      <td className="td text-body-sm text-on-surface-variant">{p.unidade}</td>
                      <td className="td text-right text-data-mono text-on-surface-variant">{p.estoqueMinimo}</td>
                      <td className={`td text-right text-data-mono font-bold ${critico ? 'text-error' : baixo ? 'text-warning' : 'text-on-surface'}`}>
                        {p.estoqueAtual}
                      </td>
                      <td className="td text-center">
                        {critico ? <span className="badge badge-error">Zerado</span>
                          : baixo ? <span className="badge badge-warning">Baixo</span>
                          : <span className="badge badge-success">Ok</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal ajuste */}
      <Modal open={modalAjuste} onClose={() => setModalAjuste(false)} title="Ajuste de Estoque">
        <form onSubmit={handleSubmit((d) => ajustar.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Produto</label>
            <select {...register('produtoId', { required: 'Selecione um produto' })} className="input">
              <option value="">Selecione o produto...</option>
              {(inventario || []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.nome} {p.codigoBarras ? `(${p.codigoBarras})` : ''} — Est. Atual: {p.estoqueAtual} {p.unidade}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tipo de Movimento</label>
            <select {...register('tipo', { required: true })} className="input">
              <optgroup label="Entradas">
                {TIPOS_ENTRADA.map((t) => <option key={t} value={t}>{tipoLabel[t]}</option>)}
              </optgroup>
              <optgroup label="Saídas">
                {TIPOS_SAIDA.map((t) => <option key={t} value={t}>{tipoLabel[t]}</option>)}
              </optgroup>
            </select>
          </div>
          <div>
            <label className="label">Quantidade</label>
            <input {...register('quantidade', { required: true, valueAsNumber: true })} type="number" step="0.001" min="0.001" className="input" />
          </div>
          <div>
            <label className="label">Motivo</label>
            <input {...register('motivo')} className="input" placeholder="Descreva o motivo..." />
          </div>
          <div className="flex justify-end gap-sm pt-2 border-t border-outline-variant">
            <button type="button" onClick={() => setModalAjuste(false)} className="btn-outline">Cancelar</button>
            <button type="submit" disabled={ajustar.isPending} className="btn-success">
              {ajustar.isPending ? 'Salvando...' : 'Aplicar Ajuste'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Entrada de Mercadorias (PRD v1.0) */}
      <EntradaMercadoriasModal open={modalEntrada} onClose={() => setModalEntrada(false)} />
    </div>
  );
}
