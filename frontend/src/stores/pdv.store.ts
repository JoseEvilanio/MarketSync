import { create } from 'zustand';
import { PagamentoItem, calcularResumoPagamentos } from '@/utils/paymentCalculator';

export type Pagamento = PagamentoItem;
export type { FormaPag } from '@/utils/paymentCalculator';

export interface ItemCarrinho {
  produtoId: string;
  nome: string;
  codigoBarras?: string;
  quantidade: number;
  tipoVenda?: 'UNIDADE' | 'PESO';
  peso?: number;
  valorKg?: number;
  precoUnit: number;
  desconto: number;
  subtotal: number;
}

interface PDVState {
  itens: ItemCarrinho[];
  clienteId: string | null;
  clienteNome: string | null;
  caixaId: string | null;
  desconto: number;
  pagamentos: Pagamento[];

  adicionarItem: (item: Omit<ItemCarrinho, 'subtotal'>) => void;
  removerItem: (produtoId: string) => void;
  alterarQuantidade: (produtoId: string, quantidade: number) => void;
  setDesconto: (valor: number) => void;
  setCliente: (id: string | null, nome: string | null) => void;
  setCaixaId: (id: string) => void;
  adicionarPagamento: (p: Pagamento) => void;
  removerPagamento: (idx: number) => void;
  limparCarrinho: () => void;

  subtotal: () => number;
  total: () => number;
  totalPago: () => number;
  troco: () => number;
}

export const usePDVStore = create<PDVState>((set, get) => ({
  itens: [],
  clienteId: null,
  clienteNome: null,
  caixaId: null,
  desconto: 0,
  pagamentos: [],

  adicionarItem: (item) => {
    const itens = [...get().itens];
    const idx = itens.findIndex((i) => i.produtoId === item.produtoId);
    const subtotal = item.precoUnit * item.quantidade - item.desconto;

    if (idx >= 0 && item.tipoVenda !== 'PESO') {
      itens[idx].quantidade += item.quantidade;
      itens[idx].subtotal = itens[idx].precoUnit * itens[idx].quantidade - itens[idx].desconto;
    } else {
      itens.push({ ...item, subtotal });
    }
    set({ itens });
  },

  removerItem: (produtoId) =>
    set((s) => ({ itens: s.itens.filter((i) => i.produtoId !== produtoId) })),

  alterarQuantidade: (produtoId, quantidade) =>
    set((s) => ({
      itens: s.itens.map((i) =>
        i.produtoId === produtoId
          ? { ...i, quantidade, subtotal: i.precoUnit * quantidade - i.desconto }
          : i
      ),
    })),

  setDesconto: (desconto) => set({ desconto }),
  setCliente: (clienteId, clienteNome) => set({ clienteId, clienteNome }),
  setCaixaId: (caixaId) => set({ caixaId }),

  adicionarPagamento: (p) => set((s) => ({ pagamentos: [...s.pagamentos, p] })),
  removerPagamento: (idx) =>
    set((s) => ({ pagamentos: s.pagamentos.filter((_, i) => i !== idx) })),

  limparCarrinho: () =>
    set({ itens: [], clienteId: null, clienteNome: null, desconto: 0, pagamentos: [] }),

  subtotal: () => get().itens.reduce((acc, i) => acc + i.subtotal, 0),
  total: () => get().subtotal() - get().desconto,
  totalPago: () => calcularResumoPagamentos(get().total(), get().pagamentos).totalPago,
  troco: () => calcularResumoPagamentos(get().total(), get().pagamentos).troco,
}));
