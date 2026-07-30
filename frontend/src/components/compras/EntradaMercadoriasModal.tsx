import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import { fornecedoresService, produtosService, categoriasService, comprasService } from '@/services/api';
import { formatCurrency } from '@/utils/format';

interface ItemEntrada {
  produtoId: string;
  codigoBarras: string;
  nome: string;
  unidade: string;
  categoriaNome: string;
  quantidade: number;
  precoCompra: number;
  freteRateado: number;
  outrosCustos: number;
  custoFinal: number;
  margemPadrao: number;
  precoSugerido: number;
  precoFinal: number;
  lucroUnitario: number;
  margemBruta: number;
  margemLiquida: number;
  markup: number;
}

interface EntradaMercadoriasModalProps {
  open: boolean;
  onClose: () => void;
}

const MARGENS_CATEGORIA: Record<string, number> = {
  'Açougue': 25,
  'Mercearia': 30,
  'Bebidas': 35,
  'Padaria': 40,
  'Hortifruti': 45,
  'Limpeza': 50,
};
const MARGEM_DEFAULT = 30;

export const EntradaMercadoriasModal: React.FC<EntradaMercadoriasModalProps> = ({ open, onClose }) => {
  const qc = useQueryClient();

  // Cabeçalho da Nota
  const [fornecedorId, setFornecedorId] = useState('');
  const [notaFiscal, setNotaFiscal] = useState('');
  const [dataEntrada, setDataEntrada] = useState(new Date().toISOString().split('T')[0]);
  const [observacoes, setObservacoes] = useState('');

  // Itens da Entrada
  const [itens, setItens] = useState<ItemEntrada[]>([]);

  // Estado da Busca / Produto selecionado
  const [buscaEan, setBuscaEan] = useState('');
  const [produtoSelecionado, setProdutoSelecionado] = useState<any | null>(null);

  // Formulário do Item Atual
  const [quantidade, setQuantidade] = useState<string>('1');
  const [precoCompra, setPrecoCompra] = useState<string>('0');
  const [freteRateado, setFreteRateado] = useState<string>('0');
  const [outrosCustos, setOutrosCustos] = useState<string>('0');
  const [margemPadrao, setMargemPadrao] = useState<string>('30');
  const [precoFinal, setPrecoFinal] = useState<string>('0');

  // Modal para cadastro rápido de novo produto se não encontrado
  const [modalNovoProd, setModalNovoProd] = useState(false);
  const [novoProdForm, setNovoProdForm] = useState({
    codigoBarras: '',
    nome: '',
    unidade: 'UN',
    categoriaId: '',
    fornecedorId: '',
    precoCompra: '0',
    precoVenda: '0',
    margemLucro: '30',
  });

  // Queries
  const { data: fornecedoresData } = useQuery({
    queryKey: ['fornecedores-lista'],
    queryFn: () => fornecedoresService.listar({ limit: 200 }),
    enabled: open,
  });

  const { data: categoriasData } = useQuery({
    queryKey: ['categorias-lista'],
    queryFn: () => categoriasService.listar({ limit: 200 }),
    enabled: open || modalNovoProd,
  });

  const fornecedores = fornecedoresData?.data || [];
  const categorias = categoriasData || [];

  // Reset do formulário de entrada
  const resetTudo = () => {
    setFornecedorId('');
    setNotaFiscal('');
    setDataEntrada(new Date().toISOString().split('T')[0]);
    setObservacoes('');
    setItens([]);
    limparItemForm();
  };

  const limparItemForm = () => {
    setBuscaEan('');
    setProdutoSelecionado(null);
    setQuantidade('1');
    setPrecoCompra('0');
    setFreteRateado('0');
    setOutrosCustos('0');
    setMargemPadrao('30');
    setPrecoFinal('0');
  };

  // Buscar produto por EAN / Nome
  const buscarProdutoMutation = useMutation({
    mutationFn: (codigo: string) => produtosService.buscarBarras(codigo),
    onSuccess: (prod) => {
      setProdutoSelecionado(prod);
      setPrecoCompra(String(prod.precoCompra || 0));
      setPrecoFinal(String(prod.precoVenda || 0));

      const catNome = prod.categoria?.nome || '';
      const margemCat = MARGENS_CATEGORIA[catNome] || prod.margemLucro || MARGEM_DEFAULT;
      setMargemPadrao(String(margemCat));

      toast.success(`Produto selecionado: ${prod.nome}`);
    },
    onError: () => {
      // Produto não encontrado -> Pergunta se deseja cadastrar um novo produto
      setNovoProdForm((prev) => ({
        ...prev,
        codigoBarras: buscaEan.trim(),
        fornecedorId: fornecedorId,
      }));
      setModalNovoProd(true);
    },
  });

  // Criar novo produto via cadastro rápido
  const criarProdutoMutation = useMutation({
    mutationFn: (dados: any) => produtosService.criar(dados),
    onSuccess: (prod) => {
      qc.invalidateQueries({ queryKey: ['produtos'] });
      toast.success('Novo produto cadastrado com sucesso!');
      setModalNovoProd(false);
      setProdutoSelecionado(prod);
      setPrecoCompra(String(prod.precoCompra || 0));
      setPrecoFinal(String(prod.precoVenda || 0));

      const catObj = categorias.find((c: any) => c.id === prod.categoriaId);
      const catNome = catObj?.nome || '';
      const margemCat = MARGENS_CATEGORIA[catNome] || prod.margemLucro || MARGEM_DEFAULT;
      setMargemPadrao(String(margemCat));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao cadastrar produto.');
    },
  });

  // Cálculos dinâmicos em tempo real do item atual (Seção 8 e 10)
  const numQtd = Math.max(0.001, parseFloat(quantidade.replace(',', '.')) || 0);
  const numPrecoCompra = Math.max(0, parseFloat(precoCompra.replace(',', '.')) || 0);
  const numFrete = Math.max(0, parseFloat(freteRateado.replace(',', '.')) || 0);
  const numOutros = Math.max(0, parseFloat(outrosCustos.replace(',', '.')) || 0);
  const numMargem = Math.max(0, parseFloat(margemPadrao.replace(',', '.')) || 0);

  const custoFinalCalc = Number((numPrecoCompra + numFrete + numOutros).toFixed(2));
  const precoSugeridoCalc = Number((custoFinalCalc + (custoFinalCalc * numMargem) / 100).toFixed(2));

  // Se o usuário não alterou o preço final manualmente ou alterou o custo, atualiza precoFinal se estiver zerado
  const numPrecoFinal = parseFloat(precoFinal.replace(',', '.')) || 0;
  const precoFinalEfetivo = numPrecoFinal > 0 ? numPrecoFinal : precoSugeridoCalc;

  const lucroUnitarioCalc = Number((precoFinalEfetivo - custoFinalCalc).toFixed(2));
  const margemBrutaCalc = precoFinalEfetivo > 0 ? Number(((lucroUnitarioCalc / precoFinalEfetivo) * 100).toFixed(1)) : 0;
  const margemLiquidaCalc = precoFinalEfetivo > 0 ? Number((((precoFinalEfetivo - custoFinalCalc - numOutros) / precoFinalEfetivo) * 100).toFixed(1)) : 0;
  const markupCalc = custoFinalCalc > 0 ? Number((precoFinalEfetivo / custoFinalCalc).toFixed(2)) : 0;

  // Atualizar Preço Sugerido automaticamente quando custo ou margem muda
  useEffect(() => {
    if (produtoSelecionado && (!precoFinal || parseFloat(precoFinal) === 0)) {
      setPrecoFinal(String(precoSugeridoCalc));
    }
  }, [custoFinalCalc, numMargem]);

  // Adicionar item à lista
  const handleAdicionarItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!produtoSelecionado) {
      toast.error('Selecione ou busque um produto primeiro por Código EAN.');
      return;
    }

    if (numQtd <= 0) {
      toast.error('Informe uma quantidade válida.');
      return;
    }

    const catObj = categorias.find((c: any) => c.id === produtoSelecionado.categoriaId);

    const novoItem: ItemEntrada = {
      produtoId: produtoSelecionado.id,
      codigoBarras: produtoSelecionado.codigoBarras || produtoSelecionado.codigoInterno || '—',
      nome: produtoSelecionado.nome,
      unidade: produtoSelecionado.unidade || 'UN',
      categoriaNome: catObj?.nome || 'Geral',
      quantidade: numQtd,
      precoCompra: numPrecoCompra,
      freteRateado: numFrete,
      outrosCustos: numOutros,
      custoFinal: custoFinalCalc,
      margemPadrao: numMargem,
      precoSugerido: precoSugeridoCalc,
      precoFinal: precoFinalEfetivo,
      lucroUnitario: lucroUnitarioCalc,
      margemBruta: margemBrutaCalc,
      margemLiquida: margemLiquidaCalc,
      markup: markupCalc,
    };

    setItens((prev) => [...prev, novoItem]);
    toast.success(`Item "${produtoSelecionado.nome}" adicionado.`);
    limparItemForm();
  };

  const handleRemoverItem = (idx: number) => {
    setItens((prev) => prev.filter((_, i) => i !== idx));
  };

  // Salvar a Entrada no Banco de Dados
  const salvarEntradaMutation = useMutation({
    mutationFn: async (concluirDireto: boolean) => {
      // 1. Criar Rascunho da Compra
      const compra = await comprasService.criar({
        fornecedorId: fornecedorId || undefined,
        notaFiscal: notaFiscal || undefined,
        observacoes: observacoes || undefined,
        itens: itens.map((item) => ({
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          precoUnit: item.custoFinal,
        })),
      });

      // 2. Atualizar Preço de Venda dos produtos negociados
      for (const item of itens) {
        if (item.precoFinal > 0) {
          try {
            await produtosService.atualizar(item.produtoId, {
              precoVenda: item.precoFinal,
              precoCompra: item.custoFinal,
            });
          } catch (err) {
            console.error('Erro ao atualizar preços do produto:', err);
          }
        }
      }

      // 3. Se concluirDireto = true -> Dar baixa e atualizar estoque
      if (concluirDireto && compra?.id) {
        await comprasService.concluir(compra.id);
      }

      return compra;
    },
    onSuccess: (_, concluirDireto) => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['produtos'] });
      qc.invalidateQueries({ queryKey: ['inventario'] });
      qc.invalidateQueries({ queryKey: ['estoque-critico'] });
      toast.success(
        concluirDireto
          ? 'Entrada registrada com sucesso! Estoque e preços atualizados.'
          : 'Entrada salva como rascunho.'
      );
      resetTudo();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao registrar entrada de mercadorias.');
    },
  });

  // Totais Gerais
  const totalFreteOutros = itens.reduce((acc, i) => acc + i.quantidade * (i.freteRateado + i.outrosCustos), 0);
  const totalGeralEntrada = itens.reduce((acc, i) => acc + i.quantidade * i.custoFinal, 0);

  return (
    <>
      <Modal open={open} onClose={onClose} title="ENTRADA DE MERCADORIAS & PRECIFICAÇÃO (PRD v1.0)" size="xl">
        <div className="space-y-md">
          {/* ── SEÇÃO 1: Cabeçalho da Nota (PRD v1.0 Seção 5) ── */}
          <div className="card p-md bg-surface-container-low border border-outline-variant space-y-sm">
            <h4 className="text-label-md font-bold uppercase tracking-wider text-primary">Dados do Cabeçalho da Nota</h4>
            <div className="grid grid-cols-4 gap-sm">
              <div>
                <label className="label text-body-sm font-bold">Fornecedor</label>
                <select
                  value={fornecedorId}
                  onChange={(e) => setFornecedorId(e.target.value)}
                  className="input text-body-sm"
                >
                  <option value="">Selecione o fornecedor...</option>
                  {fornecedores.map((f: any) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label text-body-sm font-bold">Número da Nota Fiscal</label>
                <input
                  type="text"
                  value={notaFiscal}
                  onChange={(e) => setNotaFiscal(e.target.value)}
                  placeholder="Ex: NF-12345"
                  className="input text-body-sm"
                />
              </div>

              <div>
                <label className="label text-body-sm font-bold">Data de Recebimento</label>
                <input
                  type="date"
                  value={dataEntrada}
                  onChange={(e) => setDataEntrada(e.target.value)}
                  className="input text-body-sm"
                />
              </div>

              <div>
                <label className="label text-body-sm font-bold">Observação</label>
                <input
                  type="text"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Obs. adicionais..."
                  className="input text-body-sm"
                />
              </div>
            </div>
          </div>

          {/* ── SEÇÃO 2: Busca e Seleção do Produto por EAN (PRD v1.0 Seção 6 e 7) ── */}
          <div className="card p-md border border-primary/20 bg-primary/5 space-y-sm">
            <h4 className="text-label-md font-bold uppercase tracking-wider text-primary">1. Buscar / Adicionar Item por Código EAN</h4>
            <div className="flex gap-sm items-end">
              <div className="flex-1">
                <label className="label font-bold text-body-sm">Código EAN / Nome do Produto</label>
                <input
                  type="text"
                  value={buscaEan}
                  onChange={(e) => setBuscaEan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && buscaEan.trim()) {
                      e.preventDefault();
                      buscarProdutoMutation.mutate(buscaEan.trim());
                    }
                  }}
                  placeholder="Pressione ENTER para buscar por EAN ou Nome..."
                  className="input text-body-md font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => buscaEan.trim() && buscarProdutoMutation.mutate(buscaEan.trim())}
                disabled={buscarProdutoMutation.isPending || !buscaEan.trim()}
                className="btn-primary h-11 px-4 font-bold flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[20px]">search</span>
                <span>Buscar EAN</span>
              </button>
            </div>

            {produtoSelecionado && (
              <div className="p-xs bg-surface rounded border border-outline-variant flex justify-between items-center text-body-sm">
                <div>
                  <span className="font-bold text-on-surface">{produtoSelecionado.nome}</span>
                  <span className="text-xs text-on-surface-variant ml-2">EAN: {produtoSelecionado.codigoBarras || 'N/A'}</span>
                  <span className="text-xs text-on-surface-variant ml-2">| Un: {produtoSelecionado.unidade}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setProdutoSelecionado(null)}
                  className="text-xs text-error hover:underline"
                >
                  Trocar produto
                </button>
              </div>
            )}
          </div>

          {/* ── SEÇÃO 3: Formação Inteligente de Preço (3 Blocos Independente PRD v1.0 Seção 10) ── */}
          {produtoSelecionado && (
            <div className="space-y-sm border border-outline-variant rounded-xl p-md bg-surface">
              <h4 className="text-label-md font-bold uppercase tracking-wider text-on-surface">2. Calculadora de Precificação Inteligente</h4>

              <div className="grid grid-cols-3 gap-md">
                {/* BLOC 1: CUSTOS */}
                <div className="card p-sm bg-surface-container-low space-y-xs border border-outline-variant">
                  <div className="text-label-md font-bold text-on-surface uppercase border-b pb-1">CUSTOS (R$)</div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-on-surface-variant block">Quantidade</label>
                    <input
                      type="text"
                      value={quantidade}
                      onChange={(e) => setQuantidade(e.target.value)}
                      className="input input-sm text-right font-mono font-bold"
                    />

                    <label className="text-xs font-bold text-on-surface-variant block mt-1">Preço Compra (R$)</label>
                    <input
                      type="text"
                      value={precoCompra}
                      onChange={(e) => setPrecoCompra(e.target.value)}
                      className="input input-sm text-right font-mono font-bold text-primary"
                    />

                    <label className="text-xs font-bold text-on-surface-variant block mt-1">Frete Rateado (R$)</label>
                    <input
                      type="text"
                      value={freteRateado}
                      onChange={(e) => setFreteRateado(e.target.value)}
                      className="input input-sm text-right font-mono"
                    />

                    <label className="text-xs font-bold text-on-surface-variant block mt-1">Outros Custos (R$)</label>
                    <input
                      type="text"
                      value={outrosCustos}
                      onChange={(e) => setOutrosCustos(e.target.value)}
                      className="input input-sm text-right font-mono"
                    />

                    <div className="pt-2 border-t flex justify-between items-center text-body-sm font-bold text-error">
                      <span>CUSTO FINAL:</span>
                      <span className="font-mono text-headline-sm">{formatCurrency(custoFinalCalc)}</span>
                    </div>
                  </div>
                </div>

                {/* BLOC 2: PRECIFICAÇÃO */}
                <div className="card p-sm bg-primary/5 space-y-xs border border-primary/20">
                  <div className="text-label-md font-bold text-primary uppercase border-b pb-1">PRECIFICAÇÃO</div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-on-surface-variant block">Margem Padrão (%)</label>
                    <input
                      type="text"
                      value={margemPadrao}
                      onChange={(e) => setMargemPadrao(e.target.value)}
                      className="input input-sm text-right font-mono font-bold"
                    />

                    <div className="p-2 bg-primary/10 rounded mt-2 text-xs font-mono space-y-1">
                      <div className="flex justify-between text-on-surface-variant">
                        <span>Preço Sugerido:</span>
                        <span className="font-bold text-primary">{formatCurrency(precoSugeridoCalc)}</span>
                      </div>
                      <div className="text-[10px] text-outline text-right">* Preço sugerido = custo + margem</div>
                    </div>

                    <label className="text-xs font-bold text-on-surface-variant block mt-2">Preço Final Definido (R$)</label>
                    <input
                      type="text"
                      value={precoFinal}
                      onChange={(e) => setPrecoFinal(e.target.value)}
                      placeholder={formatCurrency(precoSugeridoCalc)}
                      className="input input-sm text-right font-mono text-headline-sm font-black text-success"
                    />
                  </div>
                </div>

                {/* BLOC 3: RENTABILIDADE */}
                <div className="card p-sm bg-success/5 space-y-xs border border-success/20 font-mono">
                  <div className="text-label-md font-bold text-success uppercase border-b pb-1 font-sans">RENTABILIDADE</div>
                  <div className="space-y-2 text-body-sm pt-1">
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Lucro Unitário:</span>
                      <span className={`font-bold ${lucroUnitarioCalc >= 0 ? 'text-success' : 'text-error'}`}>
                        {formatCurrency(lucroUnitarioCalc)}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Margem Bruta:</span>
                      <span className="font-bold text-on-surface">{margemBrutaCalc}%</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Margem Líquida:</span>
                      <span className="font-bold text-on-surface">{margemLiquidaCalc}%</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Markup:</span>
                      <span className="font-bold text-on-surface">{markupCalc}x</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-xs">
                <button
                  type="button"
                  onClick={handleAdicionarItem}
                  className="btn-success px-4 py-2 font-bold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  <span>Confirmar e Adicionar Item</span>
                </button>
              </div>
            </div>
          )}

          {/* ── SEÇÃO 4: Tabela de Itens Adicionados à Nota ── */}
          {itens.length > 0 && (
            <div className="card overflow-hidden border border-outline-variant space-y-xs">
              <div className="p-sm bg-surface-container-low border-b font-bold text-body-sm text-on-surface">
                Itens na Nota de Entrada ({itens.length})
              </div>
              <table className="w-full text-body-sm">
                <thead className="table-header text-xs">
                  <tr>
                    <th className="th">EAN / Produto</th>
                    <th className="th text-right">Qtd</th>
                    <th className="th text-right">Custo Unit.</th>
                    <th className="th text-right">Custo Final</th>
                    <th className="th text-right">Preço Sugerido</th>
                    <th className="th text-right">Preço Final</th>
                    <th className="th text-right">Subtotal Custo</th>
                    <th className="th w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {itens.map((item, idx) => (
                    <tr key={idx} className="tr-hover">
                      <td className="td">
                        <div className="font-bold text-on-surface">{item.nome}</div>
                        <div className="text-xs text-on-surface-variant font-mono">{item.codigoBarras} | {item.categoriaNome}</div>
                      </td>
                      <td className="td text-right font-mono font-bold">{item.quantidade} {item.unidade}</td>
                      <td className="td text-right font-mono">{formatCurrency(item.precoCompra)}</td>
                      <td className="td text-right font-mono text-error font-bold">{formatCurrency(item.custoFinal)}</td>
                      <td className="td text-right font-mono text-on-surface-variant">{formatCurrency(item.precoSugerido)}</td>
                      <td className="td text-right font-mono text-success font-black">{formatCurrency(item.precoFinal)}</td>
                      <td className="td text-right font-mono font-black text-on-surface">
                        {formatCurrency(item.quantidade * item.custoFinal)}
                      </td>
                      <td className="td">
                        <button
                          type="button"
                          onClick={() => handleRemoverItem(idx)}
                          className="p-1 text-error hover:bg-error-container rounded"
                          title="Remover item"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── SEÇÃO 5: Rodapé e Totais da Entrada (PRD v1.0 Seção 13) ── */}
          <div className="pt-sm border-t border-outline-variant flex items-center justify-between">
            <div className="text-body-sm font-mono space-x-md text-on-surface-variant">
              <span>Qtd Itens: <b>{itens.length}</b></span>
              <span>Custos Adicionais: <b>{formatCurrency(totalFreteOutros)}</b></span>
              <span className="text-body-md font-bold text-on-surface">Total Entrada: <b className="text-headline-sm text-primary">{formatCurrency(totalGeralEntrada)}</b></span>
            </div>

            <div className="flex gap-sm">
              <button type="button" onClick={onClose} className="btn-outline">
                Cancelar
              </button>

              <button
                type="button"
                disabled={itens.length === 0 || salvarEntradaMutation.isPending}
                onClick={() => salvarEntradaMutation.mutate(false)}
                className="btn-outline font-bold text-primary"
              >
                Salvar Rascunho
              </button>

              <button
                type="button"
                disabled={itens.length === 0 || salvarEntradaMutation.isPending}
                onClick={() => salvarEntradaMutation.mutate(true)}
                className="btn-success font-bold text-headline-sm px-6 h-12 shadow-sm"
              >
                {salvarEntradaMutation.isPending ? 'Salvando...' : 'FINALIZAR & ATUALIZAR ESTOQUE'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── MODAL CADASTRO RÁPIDO DE NOVO PRODUTO (PRD v1.0 Seção 7) ── */}
      <Modal open={modalNovoProd} onClose={() => setModalNovoProd(false)} title="Produto não encontrado — Cadastrar Novo Produto">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            criarProdutoMutation.mutate({
              codigoBarras: novoProdForm.codigoBarras || undefined,
              nome: novoProdForm.nome,
              unidade: novoProdForm.unidade,
              categoriaId: novoProdForm.categoriaId || undefined,
              fornecedorId: novoProdForm.fornecedorId || undefined,
              precoCompra: parseFloat(novoProdForm.precoCompra) || 0,
              precoVenda: parseFloat(novoProdForm.precoVenda) || 0,
              margemLucro: parseFloat(novoProdForm.margemLucro) || 30,
              estoqueAtual: 0,
            });
          }}
          className="space-y-md"
        >
          <div className="p-xs bg-warning-container/30 rounded border border-warning text-xs font-medium text-warning-on-container">
            O Código EAN informado não existe no sistema. Preencha os dados obrigatórios para cadastrá-lo.
          </div>

          <div className="grid grid-cols-2 gap-sm">
            <div>
              <label className="label text-body-sm font-bold">Código EAN / Barras</label>
              <input
                type="text"
                value={novoProdForm.codigoBarras}
                onChange={(e) => setNovoProdForm({ ...novoProdForm, codigoBarras: e.target.value })}
                className="input text-body-sm font-mono"
                required
              />
            </div>

            <div>
              <label className="label text-body-sm font-bold">Descrição / Nome do Produto</label>
              <input
                type="text"
                value={novoProdForm.nome}
                onChange={(e) => setNovoProdForm({ ...novoProdForm, nome: e.target.value })}
                placeholder="Ex: Arroz Tipo 1 5kg"
                className="input text-body-sm"
                required
              />
            </div>

            <div>
              <label className="label text-body-sm font-bold">Unidade</label>
              <select
                value={novoProdForm.unidade}
                onChange={(e) => setNovoProdForm({ ...novoProdForm, unidade: e.target.value })}
                className="input text-body-sm"
              >
                <option value="UN">UN - Unidade</option>
                <option value="KG">KG - Quilograma</option>
                <option value="CX">CX - Caixa</option>
                <option value="LT">LT - Litro</option>
              </select>
            </div>

            <div>
              <label className="label text-body-sm font-bold">Categoria</label>
              <select
                value={novoProdForm.categoriaId}
                onChange={(e) => setNovoProdForm({ ...novoProdForm, categoriaId: e.target.value })}
                className="input text-body-sm"
              >
                <option value="">Selecione a categoria...</option>
                {categorias.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-sm pt-sm border-t">
            <button type="button" onClick={() => setModalNovoProd(false)} className="btn-outline">
              Cancelar
            </button>
            <button type="submit" disabled={criarProdutoMutation.isPending} className="btn-primary font-bold">
              {criarProdutoMutation.isPending ? 'Cadastrando...' : 'Cadastrar e Selecionar'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};
