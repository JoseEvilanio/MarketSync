import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { usePDVStore } from '@/stores/pdv.store';
import { useAuthStore } from '@/stores/auth.store';
import { produtosService, vendasService, caixaService, clientesService } from '@/services/api';
import { formatCurrency } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import ModalCaixa from '@/components/ui/ModalCaixa';
import { ModalFinalizacaoPDV } from '@/components/pdv/ModalFinalizacaoPDV';
import { ModalConfirmarCancelamentoPDV } from '@/components/pdv/ModalConfirmarCancelamentoPDV';

export default function PDVPage() {
  const navigate = useNavigate();
  const usuario = useAuthStore((s) => s.usuario);
  const store = usePDVStore();

  const barcodeRef = useRef<HTMLInputElement>(null);
  const pesoInputRef = useRef<HTMLInputElement>(null);

  const [codigoInput, setCodigoInput] = useState('');
  const [modalPag, setModalPag] = useState(false);
  const [modalDesc, setModalDesc] = useState(false);
  const [modalCliente, setModalCliente] = useState(false);
  const [modalCaixa, setModalCaixa] = useState(false);
  
  // Modais de cancelamento (PRD Segurança PDV)
  const [modalConfirmRemoverItem, setModalConfirmRemoverItem] = useState(false);
  const [modalConfirmCancelarVenda, setModalConfirmCancelarVenda] = useState(false);

  // Modal de peso (PRD v1.2)
  const [produtoPesoPending, setProdutoPesoPending] = useState<any | null>(null);
  const [pesoInput, setPesoInput] = useState('');

  const [descInput, setDescInput] = useState('');
  const [descTipo, setDescTipo] = useState<'%' | 'R$'>('%');
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

  // Busca de clientes no modal
  const { data: clientesData } = useQuery({
    queryKey: ['clientes-pdv', debouncedCli],
    queryFn: () => clientesService.listar({ q: debouncedCli, limit: 8 }),
    enabled: modalCliente,
  });

  // Estado do Caixa do Operador
  const { data: caixa } = useQuery({ queryKey: ['caixa-atual'], queryFn: caixaService.atual });
  const isCaixaAberto = Boolean(caixa && caixa.status === 'ABERTO');

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

  // Finalizar venda com validação de Caixa
  const finalizarVenda = useMutation({
    mutationFn: () => {
      if (!isCaixaAberto) {
        throw new Error('O caixa está fechado. Abra o caixa para registrar uma venda.');
      }
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
      setItemSel(null);
      setModalPag(false);
      barcodeRef.current?.focus();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.erro || err.message || 'Erro ao registrar venda';
      toast.error(msg);
    },
  });

  // Parser do código de barras com multiplicador (PRD Seção 7)
  function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isCaixaAberto) {
      toast.error('O caixa está fechado. Abra o caixa (F7) para iniciar as vendas.');
      return;
    }

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

  // Confirmar Peso de Item (PRD Seção 7)
  function confirmarPesoItem(e?: React.FormEvent) {
    e?.preventDefault();
    if (!isCaixaAberto) {
      toast.error('O caixa está fechado.');
      return;
    }
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

  // ── Confirmação de Remoção de Item (Atalhos R / F6) ──
  function confirmarRemoverItem() {
    if (!itemSel) return;
    const itemRem = store.itens.find((i) => i.produtoId === itemSel);
    store.removerItem(itemSel);
    vendasService.auditoriaEvento('REMOVER_ITEM', {
      produtoId: itemSel,
      nome: itemRem?.nome,
      quantidade: itemRem?.quantidade,
      subtotal: itemRem?.subtotal,
    });
    toast.success(`Item "${itemRem?.nome || ''}" removido da venda.`);
    setItemSel(null);
    setModalConfirmRemoverItem(false);
    barcodeRef.current?.focus();
  }

  // ── Confirmação de Cancelamento de Toda a Venda (Atalho E) ──
  function confirmarCancelarVenda() {
    vendasService.auditoriaEvento('CANCELAR_VENDA_PDV', {
      totalItens: store.itens.length,
      totalValor: store.total(),
    });
    store.limparCarrinho();
    setItemSel(null);
    setModalConfirmCancelarVenda(false);
    toast.success('Venda cancelada.');
    barcodeRef.current?.focus();
  }

  // ── Atalhos de teclado (PRD Seção 8, 10, 12, 13, 14) ──
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isModalOpen = modalPag || modalDesc || modalCliente || modalCaixa || Boolean(produtoPesoPending) || modalConfirmRemoverItem || modalConfirmCancelarVenda;

    if (isModalOpen) return;

    const activeEl = document.activeElement;
    const isBarcodeFocused = activeEl === barcodeRef.current;
    const isInputTyping = isBarcodeFocused && codigoInput.trim().length > 0;

    // Navegação por setas (↑ e ↓) na lista de itens (Seção 14)
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isInputTyping && store.itens.length > 0) {
      e.preventDefault();
      const currentIdx = store.itens.findIndex((i) => i.produtoId === itemSel);
      if (e.key === 'ArrowDown') {
        const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % store.itens.length;
        setItemSel(store.itens[nextIdx].produtoId);
      } else if (e.key === 'ArrowUp') {
        const prevIdx = currentIdx <= 0 ? store.itens.length - 1 : currentIdx - 1;
        setItemSel(store.itens[prevIdx].produtoId);
      }
      return;
    }

    // Atalho 'R' ou 'F6' para remover item selecionado (Seção 8, 12, 13)
    if ((e.key === 'r' || e.key === 'R' || e.key === 'F6') && !isInputTyping) {
      e.preventDefault();
      if (store.itens.length === 0) {
        toast.error('Nenhum item na venda para remover.');
        return;
      }
      if (!itemSel && store.itens.length > 0) {
        setItemSel(store.itens[store.itens.length - 1].produtoId);
      }
      setModalConfirmRemoverItem(true);
      return;
    }

    // Atalho 'E' para cancelar venda inteira (Seção 10, 11, 12)
    if ((e.key === 'e' || e.key === 'E') && !isInputTyping) {
      e.preventDefault();
      if (store.itens.length === 0) {
        toast.error('Nenhuma venda em andamento para cancelar.');
        return;
      }
      setModalConfirmCancelarVenda(true);
      return;
    }

    // Atalho 'F' ou 'F5' para finalizar venda (Seção 13, 24)
    if ((e.key === 'f' || e.key === 'F' || e.key === 'F5') && !isInputTyping) {
      e.preventDefault();
      if (!isCaixaAberto) {
        toast.error('O caixa está fechado. Abra o caixa (F7) para vender.');
        return;
      }
      if (store.itens.length > 0) {
        setModalPag(true);
      } else {
        toast.error('Adicione pelo menos um item para finalizar a venda.');
      }
      return;
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
      case 'F7':
        e.preventDefault();
        setModalCaixa(true);
        break;
      case 'Escape':
        e.preventDefault();
        if (store.itens.length > 0) {
          setModalConfirmCancelarVenda(true);
        }
        break;
    }
  }, [store, itemSel, modalPag, modalDesc, modalCliente, modalCaixa, produtoPesoPending, modalConfirmRemoverItem, modalConfirmCancelarVenda, codigoInput, isCaixaAberto]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (isCaixaAberto) {
      barcodeRef.current?.focus();
    }
  }, [isCaixaAberto]);

  function aplicarDesconto() {
    const val = parseFloat(descInput);
    if (isNaN(val) || val < 0) return;
    const desconto = descTipo === '%' ? (store.subtotal() * val) / 100 : val;
    store.setDesconto(Math.min(desconto, store.subtotal()));
    setModalDesc(false);
    setDescInput('');
    barcodeRef.current?.focus();
  }

  const itemSelInfo = store.itens.find((i) => i.produtoId === itemSel);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="bg-surface-container-highest shadow-sm flex justify-between items-center px-pos-gutter h-16 shrink-0 z-40">
        <div className="flex items-center gap-md">
          <button onClick={() => navigate('/dashboard')} className="p-2 text-on-surface-variant hover:bg-primary-fixed-dim rounded transition-colors">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-headline-md font-black text-on-surface">PDV — Frente de Caixa (v2.0)</h1>
          {isCaixaAberto ? (
            <span className="badge badge-success text-[11px] flex items-center gap-1 font-semibold">
              <span className="material-symbols-outlined text-[14px]">lock_open</span>
              Caixa Aberto
            </span>
          ) : (
            <button
              onClick={() => setModalCaixa(true)}
              className="badge badge-error text-[11px] cursor-pointer hover:brightness-90 flex items-center gap-1 font-bold animate-pulse"
              title="Clique para abrir o caixa"
            >
              <span className="material-symbols-outlined text-[14px]">lock</span>
              🔒 Caixa Fechado — clique para abrir (F7)
            </button>
          )}
        </div>
        <div className="flex items-center gap-pos-gutter text-on-surface-variant text-body-sm">
          <span className="font-medium">{usuario?.nome}</span>
          <span>·</span>
          <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ── 1. Painel de Alerta Visual quando Caixa está Fechado (Seção 5, 25) ── */}
        {!isCaixaAberto && (
          <div className="absolute inset-0 bg-surface/90 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-20 h-20 bg-red-100 border border-red-300 rounded-full flex items-center justify-center text-red-600 shadow-md">
              <span className="material-symbols-outlined text-[48px]">lock</span>
            </div>
            <div className="max-w-md space-y-1">
              <h2 className="text-2xl font-black text-on-surface">CAIXA FECHADO</h2>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Abra o caixa antes de registrar produtos ou iniciar qualquer operação de venda no PDV.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalCaixa(true)}
              className="btn-primary text-base font-bold px-6 py-3 shadow-lg flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">key</span>
              [ F7 — ABRIR CAIXA ]
            </button>
          </div>
        )}

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
                <p className="text-body-lg">Escaneie ou digite um código para começar</p>
              </div>
            )}
            {store.itens.map((item, idx) => {
              const isSelected = item.produtoId === itemSel;
              return (
                <div
                  key={`${item.produtoId}-${idx}`}
                  onClick={() => setItemSel(isSelected ? null : item.produtoId)}
                  className={`flex px-md py-sm border-b border-surface-tint items-center cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-secondary/30 border-l-4 border-l-secondary-fixed font-bold'
                      : 'hover:bg-surface-tint/20'
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

                  {/* Quantidade na tabela (Estática, sem <input type="number"> - Seção 6, 24) */}
                  <div className="w-24 text-right font-mono font-bold text-on-primary">
                    {item.tipoVenda === 'PESO' ? (
                      <span className="text-secondary-fixed">{item.peso?.toFixed(3)} Kg</span>
                    ) : (
                      <span>{item.quantidade}</span>
                    )}
                  </div>

                  <div className="w-24 text-right">{formatCurrency(item.precoUnit)}</div>
                  <div className="w-28 text-right font-bold text-secondary-fixed">{formatCurrency(item.subtotal)}</div>
                  <div className="w-8 flex justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemSel(item.produtoId);
                        setModalConfirmRemoverItem(true);
                      }}
                      title="Remover item (R / F6)"
                      className="p-1 text-on-primary-container hover:text-error transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                </div>
              );
            })}
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
                  disabled={!isCaixaAberto}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  placeholder={
                    isCaixaAberto
                      ? "Código de barras ou Qtd*Código (Ex: 3*789... / F2)"
                      : "🔒 Caixa fechado — abra o caixa para vender (F7)"
                  }
                  className="w-full bg-primary text-on-primary border border-surface-tint rounded h-12 pl-10 pr-sm text-data-mono focus:border-secondary-fixed focus:ring-1 focus:ring-secondary-fixed outline-none placeholder:text-on-primary-container/50 disabled:opacity-50 disabled:cursor-not-allowed"
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
              disabled={!store.itens.length || finalizarVenda.isPending || !isCaixaAberto}
              className="w-full bg-success text-white text-headline-md font-bold rounded-lg h-16 flex items-center justify-center gap-sm hover:brightness-90 transition-all active:scale-95 disabled:opacity-40 shadow-sm"
            >
              <span className="material-symbols-outlined icon-filled text-[24px]">point_of_sale</span>
              FINALIZAR VENDA (F)
            </button>
          </div>
        </div>
      </div>

      {/* ── Footer atalhos (Seção 24) ── */}
      <footer className="bg-primary-container border-t border-primary flex justify-center items-center gap-lg py-sm h-14 shrink-0 overflow-x-auto">
        <span className="text-label-md text-on-primary-container absolute left-md">
          {store.itens.length} item(s) · {formatCurrency(store.total())}
        </span>
        {[
          { key: 'F',   label: 'Finalizar' },
          { key: 'F2',  label: 'Buscar' },
          { key: 'F3',  label: 'Cliente' },
          { key: 'F4',  label: 'Desconto' },
          { key: 'F6/R', label: 'Remover' },
          { key: 'F7',  label: 'Caixa' },
          { key: 'E',   label: 'Cancelar Venda' },
          { key: '↑↓',  label: 'Navegar' },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center gap-xs text-on-primary-container hover:text-secondary-fixed transition-colors cursor-default">
            <span className="bg-primary text-on-primary px-sm py-xs rounded text-[11px] font-mono border border-surface-tint font-bold">{key}</span>
            <span className="text-label-md font-medium">{label}</span>
          </div>
        ))}
      </footer>

      {/* ── Modal Confirmar Cancelamento / Remoção (Seção 8, 10) ── */}
      <ModalConfirmarCancelamentoPDV
        open={modalConfirmRemoverItem}
        onClose={() => setModalConfirmRemoverItem(false)}
        onConfirm={confirmarRemoverItem}
        tipo="ITEM"
        itemInfo={itemSelInfo ? {
          nome: itemSelInfo.nome,
          quantidade: itemSelInfo.quantidade,
          subtotal: itemSelInfo.subtotal,
          unidade: itemSelInfo.tipoVenda === 'PESO' ? 'Kg' : 'UN',
        } : null}
      />

      <ModalConfirmarCancelamentoPDV
        open={modalConfirmCancelarVenda}
        onClose={() => setModalConfirmCancelarVenda(false)}
        onConfirm={confirmarCancelarVenda}
        tipo="VENDA"
        vendaInfo={{
          totalItens: store.itens.length,
          totalValor: store.total(),
        }}
      />

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

      {/* ── Modal Finalização (PRD v2.0) ── */}
      <ModalFinalizacaoPDV
        open={modalPag}
        onClose={() => {
          setModalPag(false);
          barcodeRef.current?.focus();
        }}
        totalVenda={store.total()}
        pagamentos={store.pagamentos}
        onAdicionarPagamento={(p) => store.adicionarPagamento(p)}
        onRemoverPagamento={(idx) => store.removerPagamento(idx)}
        onConcluirVenda={() => finalizarVenda.mutate()}
        isPendingFinalizar={finalizarVenda.isPending}
      />

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
