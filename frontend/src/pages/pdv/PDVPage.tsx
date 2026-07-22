import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { usePDVStore } from '@/stores/pdv.store';
import { useAuthStore } from '@/stores/auth.store';
import { produtosService, vendasService, caixaService, clientesService } from '@/services/api';
import { formatCurrency, formaPagamentoLabel } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import ModalCaixa from '@/components/ui/ModalCaixa';

type FormaPag =
  | 'DINHEIRO'
  | 'PIX'
  | 'POS_DEBITO'
  | 'POS_CREDITO'
  | 'VALE_ALIMENTACAO'
  | 'VALE_REFEICAO';

const FORMAS: { key: FormaPag; tecla: string; label: string; icon: string }[] = [
  { key: 'DINHEIRO',        tecla: '2', label: '2 - Dinheiro',         icon: 'payments' },
  { key: 'PIX',             tecla: '3', label: '3 - PIX',              icon: 'pix' },
  { key: 'POS_DEBITO',      tecla: '4', label: '4 - Débito',           icon: 'credit_card' },
  { key: 'POS_CREDITO',     tecla: '5', label: '5 - Crédito',          icon: 'credit_score' },
  { key: 'VALE_ALIMENTACAO',tecla: '6', label: '6 - Vale Alimentação', icon: 'local_dining' },
  { key: 'VALE_REFEICAO',   tecla: '7', label: '7 - Vale Refeição',    icon: 'restaurant' },
];

export default function PDVPage() {
  const navigate = useNavigate();
  const usuario = useAuthStore((s) => s.usuario);
  const store = usePDVStore();

  const barcodeRef = useRef<HTMLInputElement>(null);
  const valorPagRef = useRef<HTMLInputElement>(null);
  const pesoInputRef = useRef<HTMLInputElement>(null);

  const [codigoInput, setCodigoInput] = useState('');
  const [modalPag, setModalPag] = useState(false);
  const [modalDesc, setModalDesc] = useState(false);
  const [modalCliente, setModalCliente] = useState(false);
  const [modalCaixa, setModalCaixa] = useState(false);
  
  // Modal de peso (PRD v1.2)
  const [produtoPesoPending, setProdutoPesoPending] = useState<any | null>(null);
  const [pesoInput, setPesoInput] = useState('');

  const [descInput, setDescInput] = useState('');
  const [descTipo, setDescTipo] = useState<'%' | 'R$'>('%');
  const [valorPagInput, setValorPagInput] = useState('');
  const [formaSel, setFormaSel] = useState<FormaPag>('DINHEIRO');
  const [itemSel, setItemSel] = useState<string | null>(null);
  const [searchCli, setSearchCli] = useState('');
  const [debouncedCli, setDebouncedCli] = useState('');

  // Debounce da busca de clientes
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCli(searchCli), 350);
    return () => clearTimeout(t);
  }, [searchCli]);

  // Foco no input de peso quando o modal abre
  useEffect(() => {
    if (produtoPesoPending) {
      setTimeout(() => pesoInputRef.current?.focus(), 100);
    }
  }, [produtoPesoPending]);

  // Foco no input de pagamento quando o modal abre
  useEffect(() => {
    if (modalPag) {
      setTimeout(() => valorPagRef.current?.focus(), 100);
    }
  }, [modalPag]);

  // Busca de clientes no modal
  const { data: clientesData } = useQuery({
    queryKey: ['clientes-pdv', debouncedCli],
    queryFn: () => clientesService.listar({ q: debouncedCli, limit: 8 }),
    enabled: modalCliente,
  });

  // Caixa aberto
  const { data: caixa } = useQuery({ queryKey: ['caixa-atual'], queryFn: caixaService.atual });

  // Busca de produto com suporte a Multiplicador (Qtd*Código) e Venda por Peso
  const buscarProduto = useMutation({
    mutationFn: async ({ rawInput, quantidade, codigo }: { rawInput: string; quantidade: number; codigo: string }) => {
      const prod = await produtosService.buscarBarras(codigo);
      return { prod, quantidade };
    },
    onSuccess: ({ prod, quantidade }) => {
      if (prod.tipoVenda === 'PESO') {
        setProdutoPesoPending(prod);
        setPesoInput('');
        setCodigoInput('');
        vendasService.auditoriaEvento('SOLICITACAO_PESO_PRODUTO', { produtoId: prod.id, nome: prod.nome });
      } else {
        store.adicionarItem({
          produtoId: prod.id,
          nome: prod.nome,
          codigoBarras: prod.codigoBarras,
          quantidade: quantidade,
          tipoVenda: 'UNIDADE',
          precoUnit: Number(prod.precoVenda),
          desconto: 0,
        });
        setCodigoInput('');
        barcodeRef.current?.focus();
      }
    },
    onError: () => {
      toast.error('Produto não encontrado');
      setCodigoInput('');
      barcodeRef.current?.focus();
    },
  });

  // Finalizar venda
  const finalizarVenda = useMutation({
    mutationFn: () => {
      const restante = store.total() - store.totalPago();
      if (restante > 0) {
        throw new Error('Ainda existe saldo pendente.');
      }
      return vendasService.registrar({
        clienteId: store.clienteId || undefined,
        caixaId: store.caixaId || caixa?.id || undefined,
        desconto: store.desconto,
        itens: store.itens.map((i) => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
          peso: i.peso,
          valorKg: i.valorKg,
          precoUnit: i.precoUnit,
          desconto: i.desconto,
        })),
        pagamentos: store.pagamentos,
      });
    },
    onSuccess: (venda) => {
      toast.success(`Venda #${venda.numero} registrada!`);
      vendasService.auditoriaEvento('VENDA_FINALIZADA', { vendaId: venda.id, numero: venda.numero, total: venda.total });
      store.limparCarrinho();
      setModalPag(false);
      barcodeRef.current?.focus();
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao registrar venda'),
  });

  // Parser do código de barras com multiplicador (PRD v1.2 - Seção 3)
  function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = codigoInput.trim();
    if (!raw) return;

    let quantidade = 1;
    let codigo = raw;

    if (raw.includes('*')) {
      const parts = raw.split('*');
      if (parts.length !== 2) {
        toast.error('Quantidade inválida.');
        return;
      }
      const [qtdStr, codStr] = parts;
      const qtdNum = Number(qtdStr.replace(',', '.'));

      if (isNaN(qtdNum) || qtdNum <= 0 || !/^\d+(\.\d+)?$/.test(qtdStr.replace(',', '.'))) {
        toast.error('Quantidade inválida.');
        return;
      }
      if (!codStr.trim()) {
        toast.error('Código do produto inválido.');
        return;
      }
      quantidade = qtdNum;
      codigo = codStr.trim();
    }

    buscarProduto.mutate({ rawInput: raw, quantidade, codigo });
  }

  // Confirmar Peso de Item (PRD v1.2 - Seção 4)
  function confirmarPesoItem(e?: React.FormEvent) {
    e?.preventDefault();
    if (!produtoPesoPending) return;
    const peso = parseFloat(pesoInput.replace(',', '.'));
    if (isNaN(peso) || peso <= 0) {
      toast.error('Informe um peso válido em Kg');
      return;
    }

    const precoKg = Number(produtoPesoPending.precoVenda);
    const subtotal = Number((peso * precoKg).toFixed(2));

    store.adicionarItem({
      produtoId: produtoPesoPending.id,
      nome: produtoPesoPending.nome,
      codigoBarras: produtoPesoPending.codigoBarras,
      quantidade: peso,
      tipoVenda: 'PESO',
      peso: peso,
      valorKg: precoKg,
      precoUnit: precoKg,
      desconto: 0,
    });

    vendasService.auditoriaEvento('VENDA_POR_PESO', {
      produtoId: produtoPesoPending.id,
      nome: produtoPesoPending.nome,
      peso,
      valorKg: precoKg,
      subtotal,
    });

    setProdutoPesoPending(null);
    setPesoInput('');
    barcodeRef.current?.focus();
  }

  // Atalhos de teclado (PRD v1.2 - F para finalizar, ESC preservando venda, 2-7 escolhem pagamentos)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isModalOpen = modalPag || modalDesc || modalCliente || modalCaixa || Boolean(produtoPesoPending);

    // Atalho 'F' para finalização de venda (PRD v1.2 Seção 2)
    if ((e.key === 'f' || e.key === 'F') && !isModalOpen) {
      const activeEl = document.activeElement;
      // Se não estiver digitando texto livre no input
      if (activeEl !== barcodeRef.current || !codigoInput.trim()) {
        e.preventDefault();
        if (store.itens.length > 0) {
          setModalPag(true);
        } else {
          toast.error('Adicione pelo menos um item para finalizar a venda.');
        }
        return;
      }
    }

    // Modal Pagamento ativo: teclas numeradas 2 a 7 selecionam a forma de pagamento (PRD v1.2 Seção 5)
    if (modalPag) {
      if (['2', '3', '4', '5', '6', '7'].includes(e.key)) {
        const target = FORMAS.find((f) => f.tecla === e.key);
        if (target) {
          setFormaSel(target.key);
        }
      }
    }

    switch (e.key) {
      case 'F2':
        e.preventDefault();
        barcodeRef.current?.focus();
        break;
      case 'F3':
        e.preventDefault();
        setModalCliente(true);
        break;
      case 'F4':
        e.preventDefault();
        if (store.itens.length) setModalDesc(true);
        break;
      case 'F5':
        // F5 mantido como fallback para abrir ou concluir
        e.preventDefault();
        if (store.itens.length) setModalPag(true);
        break;
      case 'F6':
        e.preventDefault();
        if (itemSel) {
          const itemRem = store.itens.find((i) => i.produtoId === itemSel);
          store.removerItem(itemSel);
          setItemSel(null);
          vendasService.auditoriaEvento('REMOVER_ITEM', { produtoId: itemSel, nome: itemRem?.nome });
        }
        break;
      case 'F7':
        e.preventDefault();
        setModalCaixa(true);
        break;
      case 'Escape':
        e.preventDefault();
        if (modalPag) {
          // ESC na tela de finalização apenas fecha o modal e mantem a venda aberta! (PRD v1.2 Seção 14)
          setModalPag(false);
          vendasService.auditoriaEvento('FECHAMENTO_TELA_FINALIZACAO_ESC', {
            total: store.total(),
            totalPago: store.totalPago(),
            itensCount: store.itens.length,
          });
          barcodeRef.current?.focus();
        } else if (produtoPesoPending) {
          setProdutoPesoPending(null);
          barcodeRef.current?.focus();
        } else if (modalDesc) {
          setModalDesc(false);
          barcodeRef.current?.focus();
        } else if (modalCliente) {
          setModalCliente(false);
          barcodeRef.current?.focus();
        } else if (store.itens.length && confirm('Deseja realmente cancelar a venda atual?')) {
          store.limparCarrinho();
          setItemSel(null);
          vendasService.auditoriaEvento('CANCELAR_VENDA_PDV');
        }
        break;
    }
  }, [store, itemSel, modalPag, modalDesc, modalCliente, modalCaixa, produtoPesoPending, codigoInput]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  function aplicarDesconto() {
    const val = parseFloat(descInput);
    if (isNaN(val) || val < 0) return;
    const desconto = descTipo === '%' ? (store.subtotal() * val) / 100 : val;
    store.setDesconto(Math.min(desconto, store.subtotal()));
    setModalDesc(false);
    setDescInput('');
    barcodeRef.current?.focus();
  }

  // Registrar pagamento via ENTER (PRD v1.2 - Seções 6 e 7)
  function handleAdicionarPagamentoEnter(e: React.FormEvent) {
    e.preventDefault();
    const restante = store.total() - store.totalPago();
    if (restante <= 0) {
      toast.error('Venda já está quitada.');
      return;
    }
    const val = parseFloat(valorPagInput.replace(',', '.')) || Math.max(0, restante);
    if (isNaN(val) || val <= 0) return;

    store.adicionarPagamento({ formaPagamento: formaSel, valor: val });
    vendasService.auditoriaEvento('INCLUSAO_PAGAMENTO', { formaPagamento: formaSel, valor: val });
    setValorPagInput('');
    setTimeout(() => valorPagRef.current?.focus(), 50);
  }

  function removerPagamentoIdx(idx: number) {
    const p = store.pagamentos[idx];
    store.removerPagamento(idx);
    vendasService.auditoriaEvento('EXCLUSAO_PAGAMENTO', { formaPagamento: p?.formaPagamento, valor: p?.valor });
  }

  const troco = store.troco();
  const restante = store.total() - store.totalPago();

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="bg-surface-container-highest shadow-sm flex justify-between items-center px-pos-gutter h-16 shrink-0 z-40">
        <div className="flex items-center gap-md">
          <button onClick={() => navigate('/dashboard')} className="p-2 text-on-surface-variant hover:bg-primary-fixed-dim rounded transition-colors">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-headline-md font-black text-on-surface">PDV — Frente de Caixa (v1.2)</h1>
          {caixa && (
            <span className="badge badge-success text-[11px]">
              <span className="material-symbols-outlined text-[14px]">lock_open</span>
              Caixa Aberto
            </span>
          )}
          {!caixa && (
            <span
              onClick={() => setModalCaixa(true)}
              className="badge badge-error text-[11px] cursor-pointer hover:brightness-90"
              title="Clique para abrir o caixa"
            >
              <span className="material-symbols-outlined text-[14px]">lock</span>
              Caixa Fechado — clique para abrir
            </span>
          )}
        </div>
        <div className="flex items-center gap-pos-gutter text-on-surface-variant text-body-sm">
          <span className="font-medium">{usuario?.nome}</span>
          <span>·</span>
          <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Lado esquerdo: lista de itens ── */}
        <div className="w-[58%] bg-primary text-on-primary flex flex-col h-full">
          {/* Cabeçalho da tabela */}
          <div className="flex px-md py-sm bg-primary-container border-b border-surface-tint text-label-md uppercase tracking-wider text-on-primary-container">
            <div className="w-10 shrink-0">#</div>
            <div className="flex-1">Produto</div>
            <div className="w-24 text-right">Qtd / Peso</div>
            <div className="w-24 text-right">Unit. / Kg</div>
            <div className="w-28 text-right">Total</div>
            <div className="w-8"></div>
          </div>

          {/* Itens */}
          <div className="flex-1 overflow-y-auto text-data-mono">
            {store.itens.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-md text-on-primary-container/60">
                <span className="material-symbols-outlined text-[64px]">barcode_scanner</span>
                <p className="text-body-lg">Escaneie ou digite um código para começar (Ex: 3*789...)</p>
              </div>
            )}
            {store.itens.map((item, idx) => (
              <div
                key={`${item.produtoId}-${idx}`}
                onClick={() => setItemSel(item.produtoId === itemSel ? null : item.produtoId)}
                className={`flex px-md py-sm border-b border-surface-tint items-center cursor-pointer transition-colors ${
                  item.produtoId === itemSel ? 'bg-secondary/20' : 'hover:bg-surface-tint/20'
                }`}
              >
                <div className="w-10 shrink-0 text-on-primary-container">{String(idx + 1).padStart(3, '0')}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-on-primary truncate">{item.nome}</div>
                  {item.tipoVenda === 'PESO' ? (
                    <div className="text-xs text-secondary-fixed font-bold">
                      {item.peso?.toFixed(3)} Kg x {formatCurrency(item.valorKg || item.precoUnit)}
                    </div>
                  ) : (
                    item.codigoBarras && <div className="text-xs text-on-primary-container">{item.codigoBarras}</div>
                  )}
                </div>
                <div className="w-24 text-right">
                  {item.tipoVenda === 'PESO' ? (
                    <span className="font-bold text-secondary-fixed">{item.peso?.toFixed(3)} Kg</span>
                  ) : (
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantidade}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const newQtd = parseFloat(e.target.value) || 0;
                        store.alterarQuantidade(item.produtoId, newQtd);
                        vendasService.auditoriaEvento('ALTERACAO_QUANTIDADE', { produtoId: item.produtoId, novaQtd: newQtd });
                      }}
                      className="w-16 bg-surface-tint/30 text-on-primary text-right rounded px-1 border border-surface-tint focus:outline-none focus:border-secondary-fixed"
                    />
                  )}
                </div>
                <div className="w-24 text-right">{formatCurrency(item.precoUnit)}</div>
                <div className="w-28 text-right font-bold text-secondary-fixed">{formatCurrency(item.subtotal)}</div>
                <div className="w-8 flex justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      store.removerItem(item.produtoId);
                      if (itemSel === item.produtoId) setItemSel(null);
                      vendasService.auditoriaEvento('REMOVER_ITEM', { produtoId: item.produtoId });
                    }}
                    className="p-1 text-on-primary-container hover:text-error transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Input de código com multiplicador */}
          <div className="p-md bg-primary-container border-t border-surface-tint">
            <form onSubmit={handleBarcodeSubmit}>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-primary-container text-[20px]">
                  barcode_scanner
                </span>
                <input
                  ref={barcodeRef}
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  placeholder="Código de barras ou Qtd*Código (Ex: 3*789... / F2)"
                  className="w-full bg-primary text-on-primary border border-surface-tint rounded h-12 pl-10 pr-sm text-data-mono focus:border-secondary-fixed focus:ring-1 focus:ring-secondary-fixed outline-none placeholder:text-on-primary-container/50"
                  autoComplete="off"
                />
                {buscarProduto.isPending && (
                  <div className="absolute right-sm top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-secondary-fixed border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* ── Lado direito: totais e pagamento ── */}
        <div className="w-[42%] bg-surface flex flex-col p-lg gap-md overflow-y-auto">

          {/* Cliente */}
          <div
            onClick={() => setModalCliente(true)}
            className="card p-md flex items-center justify-between cursor-pointer hover:border-primary transition-colors"
          >
            <div className="flex items-center gap-sm">
              <div className="p-sm bg-surface-container rounded-full">
                <span className="material-symbols-outlined text-primary">person</span>
              </div>
              <div>
                <div className="text-body-sm text-on-surface-variant">Cliente (F3)</div>
                <div className="text-headline-md text-on-surface font-semibold">
                  {store.clienteNome || 'Consumidor Final'}
                </div>
              </div>
            </div>
            {store.clienteId && (
              <button
                onClick={(e) => { e.stopPropagation(); store.setCliente(null, null); }}
                className="text-on-surface-variant hover:text-error p-1 rounded"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Último item escaneado */}
          {store.itens.length > 0 && (
            <div className="card p-md flex gap-md">
              <div className="w-16 h-16 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[32px] text-on-surface-variant">inventory_2</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-label-md text-on-surface-variant uppercase">Último item</p>
                <p className="text-headline-md font-semibold text-on-surface truncate">
                  {store.itens[store.itens.length - 1].nome}
                </p>
                <div className="flex justify-between items-end mt-xs">
                  <p className="text-body-sm text-on-surface-variant">
                    {store.itens[store.itens.length - 1].tipoVenda === 'PESO'
                      ? `${store.itens[store.itens.length - 1].peso?.toFixed(3)} Kg × ${formatCurrency(store.itens[store.itens.length - 1].valorKg || 0)}`
                      : `${store.itens[store.itens.length - 1].quantidade} × ${formatCurrency(store.itens[store.itens.length - 1].precoUnit)}`}
                  </p>
                  <p className="text-headline-md font-bold text-on-surface">
                    {formatCurrency(store.itens[store.itens.length - 1].subtotal)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1" />

          {/* Totais */}
          <div className="card p-lg flex flex-col gap-md">
            <div className="flex justify-between text-body-lg text-on-surface-variant">
              <span>Subtotal ({store.itens.length} item(s))</span>
              <span className="text-data-mono">{formatCurrency(store.subtotal())}</span>
            </div>
            {store.desconto > 0 && (
              <div className="flex justify-between text-body-lg text-on-surface-variant">
                <span>Desconto</span>
                <span className="text-data-mono text-error">-{formatCurrency(store.desconto)}</span>
              </div>
            )}
            <div className="h-px bg-outline-variant" />
            <div className="flex flex-col gap-xs">
              <div className="text-headline-lg text-on-surface font-black uppercase">Total a Pagar</div>
              <div className="text-display-price font-black text-secondary bg-secondary-container/20 rounded-lg p-sm text-right">
                {formatCurrency(store.total())}
              </div>
            </div>

            {/* Desconto */}
            <button
              onClick={() => store.itens.length && setModalDesc(true)}
              disabled={!store.itens.length}
              className="btn-outline w-full text-body-sm disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[18px]">percent</span>
              Desconto (F4) {store.desconto > 0 && `— ${formatCurrency(store.desconto)}`}
            </button>

            {/* Botão finalizar (Atalhos F ou F5) */}
            <button
              onClick={() => store.itens.length && setModalPag(true)}
              disabled={!store.itens.length || finalizarVenda.isPending}
              className="w-full bg-success text-white text-headline-md font-bold rounded-lg h-16 flex items-center justify-center gap-sm hover:brightness-90 transition-all active:scale-95 disabled:opacity-40 shadow-sm"
            >
              <span className="material-symbols-outlined icon-filled text-[24px]">point_of_sale</span>
              FINALIZAR VENDA (F)
            </button>
          </div>
        </div>
      </div>

      {/* ── Footer atalhos ── */}
      <footer className="bg-primary-container border-t border-primary flex justify-center items-center gap-xl py-sm h-14 shrink-0">
        <span className="text-label-md text-on-primary-container absolute left-md">
          {store.itens.length} item(s) · {formatCurrency(store.total())}
        </span>
        {[
          { key: 'F2', label: 'Buscar' },
          { key: 'F3', label: 'Cliente' },
          { key: 'F4', label: 'Desconto' },
          { key: 'F',  label: 'Finalizar' },
          { key: 'F6', label: 'Remover' },
          { key: 'F7', label: 'Caixa' },
          { key: 'ESC', label: 'Fechar Modal' },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center gap-xs text-on-primary-container hover:text-secondary-fixed transition-colors cursor-default">
            <span className="bg-primary text-on-primary px-sm py-xs rounded text-[11px] font-mono border border-surface-tint">{key}</span>
            <span className="text-label-md">{label}</span>
          </div>
        ))}
      </footer>

      {/* ── Modal Informar Peso (PRD v1.2 - Seção 4) ── */}
      <Modal open={Boolean(produtoPesoPending)} onClose={() => setProdutoPesoPending(null)} title="Informar Peso" size="sm">
        {produtoPesoPending && (
          <form onSubmit={confirmarPesoItem} className="space-y-4">
            <div className="bg-surface-container-low p-md rounded-lg space-y-xs">
              <p className="text-label-md text-on-surface-variant uppercase font-semibold">Produto por Peso</p>
              <p className="text-headline-md font-bold text-on-surface">{produtoPesoPending.nome}</p>
              <p className="text-body-md text-secondary font-semibold">
                Preço/Kg: {formatCurrency(Number(produtoPesoPending.precoVenda))}
              </p>
            </div>

            <div>
              <label className="label text-body-lg font-bold">Peso (Kg)</label>
              <input
                ref={pesoInputRef}
                type="text"
                value={pesoInput}
                onChange={(e) => setPesoInput(e.target.value)}
                placeholder="Ex: 1,350"
                className="input-lg text-center text-2xl font-black text-primary"
                autoFocus
              />
              {pesoInput && !isNaN(parseFloat(pesoInput.replace(',', '.'))) && (
                <p className="text-center text-headline-sm font-bold text-success mt-2">
                  Subtotal: {formatCurrency(parseFloat(pesoInput.replace(',', '.')) * Number(produtoPesoPending.precoVenda))}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-sm border-t border-outline-variant pt-4">
              <button type="button" onClick={() => setProdutoPesoPending(null)} className="btn-outline">
                Cancelar
              </button>
              <button type="submit" className="btn-success text-body-md font-bold">
                Confirmar (ENTER)
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Modal Pagamento (PRD v1.2 - Seções 5 a 14) ── */}
      <Modal open={modalPag} onClose={() => { setModalPag(false); barcodeRef.current?.focus(); }} title="Finalizar Venda (Teclas 2 a 7 escolhem pagamento)" size="lg">
        <div className="flex gap-lg">
          {/* Formas de pagamento */}
          <div className="flex-1">
            <p className="label mb-sm font-bold">Forma de Pagamento (Pressione 2 a 7 ou clique)</p>
            <div className="grid grid-cols-2 gap-sm mb-md">
              {FORMAS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFormaSel(f.key)}
                  className={`flex items-center gap-sm p-sm rounded-lg border-2 transition-colors text-body-sm font-bold ${
                    formaSel === f.key
                      ? 'border-primary bg-primary text-on-primary shadow-sm'
                      : 'border-outline-variant hover:border-primary hover:bg-surface-container-low text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">{f.icon}</span>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Inserção por Enter - sem botão Adicionar (PRD v1.2 Seção 6) */}
            <form onSubmit={handleAdicionarPagamentoEnter} className="space-y-xs">
              <label className="label font-bold">Valor do Pagamento (R$) — Pressione ENTER para confirmar</label>
              <div className="relative">
                <input
                  ref={valorPagRef}
                  type="text"
                  value={valorPagInput}
                  onChange={(e) => setValorPagInput(e.target.value)}
                  placeholder={`Saldo restante: ${formatCurrency(Math.max(0, restante))}`}
                  className="input-lg text-center text-2xl font-black text-primary w-full pr-16"
                  autoFocus
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-label-md font-mono text-on-surface-variant/70 border border-outline-variant px-2 py-1 rounded bg-surface-container">
                  ENTER
                </span>
              </div>
              <p className="text-xs text-on-surface-variant text-center">
                * Pressione <b>ENTER</b> no valor para adicionar o pagamento.
              </p>
            </form>

            {/* Pagamentos adicionados */}
            {store.pagamentos.length > 0 && (
              <div className="mt-md space-y-xs max-h-40 overflow-y-auto">
                <p className="label font-bold">Pagamentos Registrados ({store.pagamentos.length})</p>
                {store.pagamentos.map((p, i) => (
                  <div key={i} className="flex items-center justify-between bg-surface-container-low rounded-lg px-md py-sm border border-outline-variant">
                    <div className="flex items-center gap-sm">
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                        {FORMAS.find((f) => f.key === p.formaPagamento)?.icon || 'payments'}
                      </span>
                      <span className="text-body-sm font-bold">{formaPagamentoLabel[p.formaPagamento] || p.formaPagamento}</span>
                    </div>
                    <div className="flex items-center gap-sm">
                      <span className="text-data-mono font-black text-headline-sm">{formatCurrency(p.valor)}</span>
                      <button onClick={() => removerPagamentoIdx(i)} className="text-error hover:bg-error-container p-1 rounded" title="Remover pagamento">
                        <span className="material-symbols-outlined text-[18px]">remove_circle</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resumo e Conclusão */}
          <div className="w-64 flex flex-col gap-md">
            <div className="card p-md flex flex-col gap-sm bg-surface-container-low">
              <div className="flex justify-between text-body-md text-on-surface-variant">
                <span>Total da Venda</span>
                <span className="text-data-mono font-bold text-on-surface">{formatCurrency(store.total())}</span>
              </div>
              <div className="flex justify-between text-body-md text-on-surface-variant">
                <span>Total Pago</span>
                <span className="text-data-mono font-bold text-success">{formatCurrency(store.totalPago())}</span>
              </div>
              {restante > 0 && (
                <div className="flex justify-between text-body-md text-on-surface-variant">
                  <span>Saldo Restante</span>
                  <span className="text-data-mono font-bold text-error">{formatCurrency(restante)}</span>
                </div>
              )}
              {troco > 0 && (
                <>
                  <div className="h-px bg-outline-variant" />
                  <div className="flex justify-between text-body-lg font-bold">
                    <span>Troco (Dinheiro)</span>
                    <span className="text-data-mono text-success font-black">{formatCurrency(troco)}</span>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => finalizarVenda.mutate()}
              disabled={restante > 0 || finalizarVenda.isPending || store.itens.length === 0}
              className="mt-auto w-full bg-success text-white font-bold text-headline-md rounded-xl h-16 flex items-center justify-center gap-sm hover:brightness-90 transition-all active:scale-95 disabled:opacity-40 shadow-sm"
            >
              {finalizarVenda.isPending ? (
                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Finalizando...</>
              ) : (
                <><span className="material-symbols-outlined icon-filled">check_circle</span> CONCLUIR VENDA</>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setModalPag(false);
                vendasService.auditoriaEvento('FECHAMENTO_TELA_FINALIZACAO_ESC');
                barcodeRef.current?.focus();
              }}
              className="btn-outline w-full text-body-sm"
            >
              Voltar à Venda (ESC)
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal Desconto ── */}
      <Modal open={modalDesc} onClose={() => setModalDesc(false)} title="Aplicar Desconto (F4)" size="sm">
        <div className="space-y-4">
          <div className="flex gap-sm">
            {(['%', 'R$'] as const).map((t) => (
              <button key={t} onClick={() => setDescTipo(t)}
                className={`flex-1 py-2 rounded-lg border-2 font-bold transition-colors ${descTipo === t ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant'}`}>
                {t}
              </button>
            ))}
          </div>
          <div>
            <label className="label">Valor do Desconto</label>
            <input
              type="number" step="0.01" min="0"
              value={descInput}
              onChange={(e) => setDescInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicarDesconto()}
              className="input-lg text-center text-xl font-bold"
              placeholder={descTipo === '%' ? '0' : '0,00'}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-sm border-t border-outline-variant pt-4">
            <button onClick={() => { store.setDesconto(0); setModalDesc(false); }} className="btn-ghost">Remover Desconto</button>
            <button onClick={aplicarDesconto} className="btn-primary">Aplicar</button>
          </div>
        </div>
      </Modal>

      {/* ── Modal Cliente ── */}
      <Modal open={modalCliente} onClose={() => { setModalCliente(false); setSearchCli(''); }} title="Selecionar Cliente (F3)" size="sm">
        <div className="space-y-4">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
            <input
              value={searchCli}
              onChange={(e) => setSearchCli(e.target.value)}
              placeholder="Nome ou CPF do cliente..."
              className="input pl-9"
              autoFocus
            />
          </div>

          <button
            onClick={() => { store.setCliente(null, null); setModalCliente(false); setSearchCli(''); }}
            className="w-full btn-outline text-body-sm"
          >
            <span className="material-symbols-outlined text-[18px]">person_off</span>
            Consumidor Final (sem cadastro)
          </button>

          <div className="divide-y divide-outline-variant max-h-64 overflow-y-auto rounded-lg border border-outline-variant">
            {(clientesData?.data ?? []).length === 0 && debouncedCli.length >= 1 && (
              <p className="py-4 text-center text-body-sm text-on-surface-variant">Nenhum cliente encontrado</p>
            )}
            {(clientesData?.data ?? []).length === 0 && debouncedCli.length === 0 && (
              <p className="py-4 text-center text-body-sm text-on-surface-variant">Digite para buscar clientes</p>
            )}
            {(clientesData?.data ?? []).map((c: any) => (
              <button
                key={c.id}
                onClick={() => {
                  store.setCliente(c.id, c.nome);
                  setModalCliente(false);
                  setSearchCli('');
                  barcodeRef.current?.focus();
                }}
                className="w-full flex items-center gap-sm px-md py-sm text-left hover:bg-surface-container-low transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <span className="text-on-primary text-body-sm font-bold">{c.nome.charAt(0).toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-on-surface truncate">{c.nome}</p>
                  {c.cpf && <p className="text-label-md text-on-surface-variant">{c.cpf}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* ── Modal Caixa (F7) ── */}
      <ModalCaixa open={modalCaixa} onClose={() => { setModalCaixa(false); barcodeRef.current?.focus(); }} />
    </div>
  );
}
