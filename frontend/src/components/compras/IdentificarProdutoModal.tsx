import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import { notasFiscaisService, produtosService } from '@/services/api';

interface ItemNFe {
  // Aceita tanto o formato da ConferenciaTable (nfeItemId) quanto o antigo (id)
  id?:              string;
  nfeItemId?:       string | null;
  codigoFornecedor: string;
  gtin?:            string | null;
  descricao?:       string;
  descricaoNfe?:    string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  notaFiscalId: string;
  item: ItemNFe | null;
  onSuccess: () => void;
}

export default function IdentificarProdutoModal({ open, onClose, notaFiscalId, item, onSuccess }: Props) {
  const [busca, setBusca] = useState('');
  const [produtos, setProdutos]   = useState<any[]>([]);
  const [selecionado, setSelecionado] = useState<any | null>(null);
  const [salvar, setSalvar]       = useState(true);
  const [buscando, setBuscando]   = useState(false);

  async function handleBuscar() {
    if (!busca.trim()) return;
    setBuscando(true);
    try {
      const res = await produtosService.listar({ q: busca.trim(), limit: 20 });
      setProdutos(res.data || []);
    } catch {
      toast.error('Erro ao buscar produtos');
    } finally {
      setBuscando(false);
    }
  }

  const { mutate: associar, isPending } = useMutation({
    mutationFn: () => {
      // O item pode vir da ConferenciaTable (campo nfeItemId) ou do formato legado (campo id)
      const itemId = item!.nfeItemId ?? item!.id;
      if (!itemId) throw new Error('ID do item da NF-e não encontrado');
      return notasFiscaisService.identificarProduto(notaFiscalId, {
        notaFiscalItemId:    itemId,
        produtoId:           selecionado!.id,
        salvarRelacionamento: salvar,
      });
    },
    onSuccess: () => {
      toast.success('Produto associado com sucesso!');
      setBusca(''); setProdutos([]); setSelecionado(null);
      onSuccess();
      onClose();
    },
    onError: () => toast.error('Erro ao associar produto'),
  });

  function handleClose() {
    if (isPending) return;
    setBusca(''); setProdutos([]); setSelecionado(null); onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Identificar Produto" size="lg">
      <div className="space-y-4">

        {/* Dados do item NF-e */}
        {item && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
            <p className="text-xs font-bold text-amber-700 uppercase">Item da NF-e não identificado</p>
            <p className="text-sm font-semibold text-on-surface">
              {item.descricao ?? item.descricaoNfe ?? '—'}
            </p>
            <div className="flex gap-4 text-xs text-on-surface-variant">
              <span>Cód. Fornecedor: <strong>{item.codigoFornecedor}</strong></span>
              {item.gtin && <span>GTIN/EAN: <strong>{item.gtin}</strong></span>}
            </div>
          </div>
        )}

        {/* Busca de produto */}
        <div>
          <label className="label">Buscar produto interno</label>
          <div className="flex gap-2">
            <input value={busca} onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
              className="input flex-1" placeholder="Nome ou código de barras..." />
            <button type="button" onClick={handleBuscar} disabled={buscando || !busca.trim()}
              className="btn-primary px-4">
              {buscando
                ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                : <span className="material-symbols-outlined text-[18px]">search</span>}
            </button>
          </div>
        </div>

        {/* Resultados */}
        {produtos.length > 0 && (
          <div className="border border-outline rounded-lg overflow-hidden max-h-48 overflow-y-auto">
            {produtos.map((p: any) => (
              <button key={p.id} type="button"
                onClick={() => setSelecionado(p)}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-surface-container-low transition ${
                  selecionado?.id === p.id ? 'bg-primary/10 font-semibold' : ''
                }`}>
                <div>
                  <span className="text-on-surface">{p.nome}</span>
                  {p.codigoBarras && <span className="text-xs text-on-surface-variant ml-2">{p.codigoBarras}</span>}
                </div>
                {selecionado?.id === p.id &&
                  <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>}
              </button>
            ))}
          </div>
        )}

        {/* Produto selecionado */}
        {selecionado && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-green-600">check_circle</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-on-surface">{selecionado.nome}</p>
              <p className="text-xs text-on-surface-variant">Estoque atual: {selecionado.estoqueAtual}</p>
            </div>
          </div>
        )}

        {/* Salvar relacionamento */}
        <label className="flex items-center gap-2 cursor-pointer text-sm text-on-surface">
          <input type="checkbox" checked={salvar} onChange={(e) => setSalvar(e.target.checked)}
            className="rounded border-outline text-primary" />
          Salvar associação para próximas NF-e deste fornecedor
        </label>

        {/* Botões */}
        <div className="flex justify-end gap-3 border-t border-outline-variant pt-4">
          <button type="button" onClick={handleClose} disabled={isPending} className="btn-outline">Cancelar</button>
          <button type="button" onClick={() => associar()} disabled={!selecionado || isPending}
            className="btn-primary flex items-center gap-2">
            {isPending
              ? <><span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>Salvando...</>
              : <><span className="material-symbols-outlined text-[18px]">link</span>Associar Produto</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
