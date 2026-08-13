import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import { notasFiscaisService, produtosService, categoriasService } from '@/services/api';
import { formatCurrency } from '@/utils/format';

export interface ItemNFe {
  id?:                 string;
  nfeItemId?:          string | null;
  codigoFornecedor:    string;
  gtin?:               string | null;
  descricao?:          string;
  descricaoNfe?:       string;
  quantidadeNfe?:      number;
  quantidadeReceber?:  number;
  valorUnitario?:      number;
  unidade?:            string;
  ncm?:                string | null;
  cest?:               string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  notaFiscalId: string;
  item: ItemNFe | null;
  onSuccess: () => void;
}

export default function IdentificarProdutoModal({ open, onClose, notaFiscalId, item, onSuccess }: Props) {
  const [modo, setModo]                   = useState<'BUSCA' | 'CADASTRO'>('BUSCA');
  const [busca, setBusca]                 = useState('');
  const [produtos, setProdutos]           = useState<any[]>([]);
  const [selecionado, setSelecionado]     = useState<any | null>(null);
  const [salvar, setSalvar]               = useState(true);
  const [buscando, setBuscando]           = useState(false);
  const [categorias, setCategorias]       = useState<any[]>([]);

  // ── Formulário de Cadastro Rápido ──
  const [nomeForm, setNomeForm]                   = useState('');
  const [codigoBarrasForm, setCodigoBarrasForm]   = useState('');
  const [codigoInternoForm, setCodigoInternoForm] = useState('');
  const [unidadeForm, setUnidadeForm]             = useState('UN');
  const [precoCompraForm, setPrecoCompraForm]     = useState<number>(0);
  const [precoVendaForm, setPrecoVendaForm]       = useState('');
  const [categoriaIdForm, setCategoriaIdForm]     = useState('');
  const [estoqueMinimoForm, setEstoqueMinimoForm] = useState('0');
  const [eanExistente, setEanExistente]           = useState<any | null>(null);
  const [checandoEan, setChecandoEan]             = useState(false);

  // ── Inicialização ao abrir modal ──
  useEffect(() => {
    if (open && item) {
      setModo('BUSCA');
      setSelecionado(null);
      setSalvar(true);
      setEanExistente(null);

      const desc = item.descricao ?? item.descricaoNfe ?? '';
      const gtin = item.gtin ?? '';
      const val  = item.valorUnitario ?? 0;
      const un   = item.unidade ?? 'UN';

      // Termo de busca inicial (GTIN ou primeiros 30 chars da descrição)
      const termo = gtin || desc.slice(0, 30);
      setBusca(termo);
      if (termo) {
        executarBusca(termo);
      } else {
        setProdutos([]);
      }

      // Preencher formulário de cadastro rápido
      setNomeForm(desc);
      setCodigoBarrasForm(gtin);
      setCodigoInternoForm('');
      setUnidadeForm(un);
      setPrecoCompraForm(val);
      // Preço de venda sugerido com 35% de margem padronizada se houver custo
      setPrecoVendaForm(val > 0 ? (val * 1.35).toFixed(2) : '');
      setCategoriaIdForm('');
      setEstoqueMinimoForm('0');

      // Buscar categorias para o dropdown
      categoriasService.listar({ limit: 100 })
        .then((res) => setCategorias(res.data || res || []))
        .catch(() => {});
    }
  }, [open, item]);

  // ── Verificar EAN duplicado ao digitar no cadastro rápido ──
  useEffect(() => {
    const eanClean = codigoBarrasForm.trim();
    if (!eanClean || eanClean.toUpperCase() === 'SEM GTIN' || eanClean.length < 3) {
      setEanExistente(null);
      return;
    }

    const timer = setTimeout(async () => {
      setChecandoEan(true);
      try {
        const res = await produtosService.listar({ q: eanClean, limit: 5 });
        const list = res.data || [];
        const match = list.find((p: any) => p.codigoBarras === eanClean);
        setEanExistente(match || null);
      } catch {
        setEanExistente(null);
      } finally {
        setChecandoEan(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [codigoBarrasForm]);

  // ── Buscar produtos existentes ──
  async function executarBusca(termo: string) {
    if (!termo.trim()) return;
    setBuscando(true);
    try {
      const res = await produtosService.listar({ q: termo.trim(), limit: 20 });
      setProdutos(res.data || []);
    } catch {
      toast.error('Erro ao buscar produtos no MercadoPro');
    } finally {
      setBuscando(false);
    }
  }

  function handleBuscarClick() {
    executarBusca(busca);
  }

  // ── Mutation para Associar Produto Existente ──
  const { mutate: associar, isPending: associando } = useMutation({
    mutationFn: () => {
      const itemId = item!.nfeItemId ?? item!.id;
      if (!itemId) throw new Error('ID do item da NF-e não informado');
      return notasFiscaisService.identificarProduto(notaFiscalId, {
        notaFiscalItemId:     itemId,
        produtoId:            selecionado!.id,
        salvarRelacionamento: salvar,
      });
    },
    onSuccess: () => {
      toast.success('Produto associado com sucesso!');
      handleClose();
      onSuccess();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.erro || 'Erro ao associar produto');
    },
  });

  // ── Mutation para Cadastrar Novo Produto e Associar ──
  const { mutate: cadastrarEAssociar, isPending: cadastrando } = useMutation({
    mutationFn: () => {
      const itemId = item!.nfeItemId ?? item!.id;
      if (!itemId) throw new Error('ID do item da NF-e não informado');

      const pVenda = parseFloat(precoVendaForm.replace(',', '.'));
      if (isNaN(pVenda) || pVenda <= 0) {
        throw new Error('Preço de venda deve ser maior que zero');
      }

      return notasFiscaisService.cadastrarEAssociarProduto(notaFiscalId, {
        notaFiscalItemId:     itemId,
        nome:                 nomeForm.trim(),
        codigoBarras:         codigoBarrasForm.trim() || undefined,
        codigoInterno:        codigoInternoForm.trim() || undefined,
        unidade:              unidadeForm || 'UN',
        precoCompra:          precoCompraForm,
        precoVenda:           pVenda,
        categoriaId:          categoriaIdForm || undefined,
        estoqueMinimo:        parseFloat(estoqueMinimoForm) || 0,
        salvarRelacionamento: salvar,
      });
    },
    onSuccess: (res: any) => {
      toast.success(res.mensagem || 'Produto cadastrado e associado com sucesso!');
      handleClose();
      onSuccess();
    },
    onError: (err: any) => {
      const erroMsg = err?.response?.data?.erro || err?.message || 'Erro ao cadastrar produto';
      const prodDup = err?.response?.data?.detalhes?.produtoExistente;
      if (prodDup) {
        setEanExistente(prodDup);
        toast.error('EAN já cadastrado! Veja o alerta no formulário.');
      } else {
        toast.error(erroMsg);
      }
    },
  });

  function handleUsarProdutoExistente(prod: any) {
    setSelecionado(prod);
    setModo('BUSCA');
    toast.success(`Produto "${prod.nome}" selecionado para associação.`);
  }

  function handleClose() {
    if (associando || cadastrando) return;
    setBusca('');
    setProdutos([]);
    setSelecionado(null);
    setEanExistente(null);
    onClose();
  }

  const descNfe = item?.descricao ?? item?.descricaoNfe ?? '—';
  const gtinNfe = item?.gtin ?? 'Não informado';
  const qtdNfe  = item?.quantidadeNfe ?? item?.quantidadeReceber ?? 0;
  const valorNfe = item?.valorUnitario ?? 0;

  return (
    <Modal open={open} onClose={handleClose} title="Identificar Produto da NF-e" size="lg">
      <div className="space-y-4">

        {/* ── 1. Painel de Dados Importados da NF-e ── */}
        {item && (
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Item da NF-e
              </span>
              <span className="text-xs text-on-surface-variant font-mono">
                Cód. Fornecedor: <strong>{item.codigoFornecedor}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div className="md:col-span-2">
                <span className="text-xs text-on-surface-variant font-medium block">Descrição no Documento Fiscal</span>
                <p className="font-bold text-on-surface leading-tight">{descNfe}</p>
              </div>
              <div>
                <span className="text-xs text-on-surface-variant font-medium block">EAN / GTIN</span>
                <p className="font-mono text-on-surface font-semibold">{gtinNfe}</p>
              </div>
              <div>
                <span className="text-xs text-on-surface-variant font-medium block">Qtd x Valor Unit.</span>
                <p className="font-mono text-on-surface">
                  {qtdNfe} {item.unidade || 'UN'} × <strong>{formatCurrency(valorNfe)}</strong>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── 2. Seletor de Modo (Abas) ── */}
        <div className="flex border-b border-outline-variant gap-2">
          <button
            type="button"
            onClick={() => setModo('BUSCA')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
              modo === 'BUSCA'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">search</span>
            Pesquisar Produto Existente
          </button>
          <button
            type="button"
            onClick={() => setModo('CADASTRO')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
              modo === 'CADASTRO'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            + Cadastrar Novo Produto
          </button>
        </div>

        {/* ── 3. ABA BUSCA E ASSOCIAÇÃO ── */}
        {modo === 'BUSCA' && (
          <div className="space-y-4">
            <div>
              <label className="label">Pesquisar no cadastro do MercadoPro</label>
              <div className="flex gap-2">
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBuscarClick()}
                  className="input flex-1 font-sans"
                  placeholder="Pesquisar por código interno, EAN ou descrição..."
                />
                <button
                  type="button"
                  onClick={handleBuscarClick}
                  disabled={buscando || !busca.trim()}
                  className="btn-primary px-4 flex items-center gap-1"
                >
                  {buscando ? (
                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">search</span>
                      Pesquisar
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Lista de Resultados */}
            {produtos.length > 0 ? (
              <div className="border border-outline rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container-low text-xs text-on-surface-variant sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Produto MercadoPro</th>
                      <th className="text-left px-3 py-2">EAN</th>
                      <th className="text-right px-3 py-2">Estoque</th>
                      <th className="text-center px-3 py-2">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {produtos.map((p) => {
                      const isSel = selecionado?.id === p.id;
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setSelecionado(p)}
                          className={`cursor-pointer transition hover:bg-surface-container-low ${
                            isSel ? 'bg-primary/10 font-medium' : ''
                          }`}
                        >
                          <td className="px-3 py-2.5">
                            <p className="text-on-surface font-semibold">{p.nome}</p>
                            {p.codigoInterno && (
                              <p className="text-xs text-on-surface-variant font-mono">Cód: {p.codigoInterno}</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-on-surface-variant">
                            {p.codigoBarras || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-on-surface">
                            {p.estoqueAtual ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelecionado(p);
                              }}
                              className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition ${
                                isSel
                                  ? 'bg-primary text-on-primary'
                                  : 'bg-surface-container-high text-on-surface hover:bg-primary/20'
                              }`}
                            >
                              {isSel ? 'Selecionado' : 'Selecionar'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : buscando ? (
              <p className="text-sm text-center py-6 text-on-surface-variant animate-pulse">
                Buscando correspondências no MercadoPro...
              </p>
            ) : (
              <div className="bg-surface-container-low border border-dashed border-outline-variant rounded-xl p-6 text-center space-y-2">
                <p className="text-sm font-semibold text-on-surface">Nenhum produto encontrado no MercadoPro</p>
                <p className="text-xs text-on-surface-variant">
                  Se este item for um novo produto na sua loja, cadastre-o rapidamente abaixo sem sair da conferência.
                </p>
                <button
                  type="button"
                  onClick={() => setModo('CADASTRO')}
                  className="btn-outline text-xs px-3 py-1.5 inline-flex items-center gap-1 mt-1"
                >
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  Cadastrar novo produto agora
                </button>
              </div>
            )}

            {/* Painel do produto selecionado */}
            {selecionado && (
              <div className="bg-green-50 border border-green-300 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-600">check_circle</span>
                  <div>
                    <p className="text-sm font-bold text-on-surface">{selecionado.nome}</p>
                    <p className="text-xs text-on-surface-variant font-mono">
                      Cód: {selecionado.codigoInterno || '—'} • EAN: {selecionado.codigoBarras || '—'} • Estoque atual: {selecionado.estoqueAtual ?? 0}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-green-700 bg-green-100 px-2.5 py-1 rounded-lg">Pronto para associar</span>
              </div>
            )}
          </div>
        )}

        {/* ── 4. ABA CADASTRO RÁPIDO ── */}
        {modo === 'CADASTRO' && (
          <div className="space-y-4">

            {/* Alerta de EAN duplicado se detectado (Seção 23 / CA-06) */}
            {eanExistente && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex items-start gap-3">
                <span className="material-symbols-outlined text-amber-600 shrink-0">warning</span>
                <div className="space-y-1 text-sm flex-1">
                  <p className="font-bold text-amber-900">EAN já cadastrado no sistema!</p>
                  <p className="text-xs text-amber-800 leading-snug">
                    O EAN <strong>{codigoBarrasForm}</strong> já pertence ao produto MercadoPro:{' '}
                    <strong>{eanExistente.nome}</strong> (Cód. {eanExistente.codigoInterno || 'S/N'}).
                  </p>
                  <button
                    type="button"
                    onClick={() => handleUsarProdutoExistente(eanExistente)}
                    className="btn-primary text-xs py-1 px-3 mt-1 inline-flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">link</span>
                    Usar este produto existente
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {/* Descrição */}
              <div className="md:col-span-2">
                <label className="label">
                  Descrição do Produto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nomeForm}
                  onChange={(e) => setNomeForm(e.target.value)}
                  className="input font-semibold"
                  placeholder="Nome do produto no cadastro interno"
                />
              </div>

              {/* EAN / GTIN */}
              <div>
                <label className="label flex items-center justify-between">
                  <span>EAN / GTIN <span className="text-red-500">*</span></span>
                  {checandoEan && <span className="text-[10px] text-primary animate-pulse">Verificando EAN...</span>}
                </label>
                <input
                  type="text"
                  value={codigoBarrasForm}
                  onChange={(e) => setCodigoBarrasForm(e.target.value)}
                  className="input font-mono"
                  placeholder="789..."
                />
              </div>

              {/* Unidade */}
              <div>
                <label className="label">
                  Unidade <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={unidadeForm}
                  onChange={(e) => setUnidadeForm(e.target.value.toUpperCase())}
                  className="input font-mono uppercase"
                  placeholder="UN, KG, CX..."
                />
              </div>

              {/* Preço de Compra (NF-e) */}
              <div>
                <label className="label">Preço de Compra (NF-e)</label>
                <input
                  type="text"
                  disabled
                  value={formatCurrency(precoCompraForm)}
                  className="input bg-surface-container-low font-mono font-semibold"
                />
              </div>

              {/* Preço de Venda */}
              <div>
                <label className="label">
                  Preço de Venda (R$) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={precoVendaForm}
                  onChange={(e) => setPrecoVendaForm(e.target.value)}
                  className="input font-mono font-semibold text-primary"
                  placeholder="0,00"
                />
              </div>

              {/* Categoria */}
              <div>
                <label className="label">Categoria</label>
                <select
                  value={categoriaIdForm}
                  onChange={(e) => setCategoriaIdForm(e.target.value)}
                  className="select"
                >
                  <option value="">Selecione uma categoria...</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nome}</option>
                  ))}
                </select>
              </div>

              {/* Código Interno */}
              <div>
                <label className="label">Código Interno (opcional)</label>
                <input
                  type="text"
                  value={codigoInternoForm}
                  onChange={(e) => setCodigoInternoForm(e.target.value)}
                  className="input font-mono"
                  placeholder="Ex: 0041"
                />
              </div>
            </div>

            {/* Nota Informativa sobre Estoque (Seção 10) */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600 shrink-0 text-[18px]">info</span>
              <span>
                <strong>Nota:</strong> O cadastro do produto disponibiliza o custo inicial. A quantidade faturada (<strong>{qtdNfe} {unidadeForm}</strong>) somente dará entrada física no estoque ao <strong>confirmar o recebimento da NF-e</strong>.
              </span>
            </div>
          </div>
        )}

        {/* ── Checkbox de Associação Futura (Seção 12 / CA-09) ── */}
        <div className="pt-2 border-t border-outline-variant">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-on-surface">
            <input
              type="checkbox"
              checked={salvar}
              onChange={(e) => setSalvar(e.target.checked)}
              className="rounded border-outline text-primary focus:ring-primary"
            />
            Salvar associação para identificar automaticamente em próximas NF-e deste fornecedor
          </label>
        </div>

        {/* ── Botões do Rodapé ── */}
        <div className="flex justify-end gap-3 border-t border-outline-variant pt-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={associando || cadastrando}
            className="btn-outline"
          >
            Cancelar
          </button>

          {modo === 'BUSCA' ? (
            <button
              type="button"
              onClick={() => associar()}
              disabled={!selecionado || associando}
              className="btn-primary flex items-center gap-2"
            >
              {associando ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  Associando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">link</span>
                  Associar Produto
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => cadastrarEAssociar()}
              disabled={!nomeForm.trim() || !precoVendaForm || cadastrando || !!eanExistente}
              className="btn-success flex items-center gap-2"
            >
              {cadastrando ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  Cadastrando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  Cadastrar e Associar Produto
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
