import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import { notasFiscaisService } from '@/services/api';
import { formatCurrency } from '@/utils/format';
import FornecedorStatusCard from './FornecedorStatusCard';
import PedidoSugeridoCard from './PedidoSugeridoCard';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (nf: any) => void;
}

type Etapa = 'upload' | 'resultado';

export default function ImportarXmlModal({ open, onClose, onSuccess }: Props) {
  const fileRef    = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo]   = useState<File | null>(null);
  const [isDrag, setIsDrag]     = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [etapa, setEtapa]       = useState<Etapa>('upload');
  const [resultado, setResultado] = useState<any>(null);

  const { mutate: importar, isPending } = useMutation({
    mutationFn: (file: File) => notasFiscaisService.importar(file, setProgresso),
    onSuccess: (data) => {
      toast.success(`NF-e ${data.numero}-${data.serie} importada!`);
      setResultado(data);
      setEtapa('resultado');
      setProgresso(0);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.erro || 'Erro ao importar XML';
      toast.error(msg);
      setProgresso(0);
    },
  });

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.xml')) { toast.error('Selecione um arquivo .xml'); return; }
    setArquivo(file);
  }
  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault(); setIsDrag(false);
    const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
  }
  function handleClose() {
    if (isPending) return;
    setArquivo(null); setProgresso(0); setEtapa('upload'); setResultado(null); onClose();
  }
  function handleProsseguir() {
    if (resultado) onSuccess(resultado);
    handleClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Importar NF-e (XML)" size="lg">
      <div className="space-y-4">

        {etapa === 'upload' && (
          <>
            {/* Input */}
            <input id="xml-file-input" ref={fileRef} type="file" accept=".xml" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

            {!arquivo ? (
              <label htmlFor="xml-file-input"
                className={`block cursor-pointer border-2 border-dashed rounded-xl p-8 text-center transition ${
                  isDrag ? 'border-primary bg-primary/5' : 'border-outline hover:border-primary text-on-surface-variant'}`}
                onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
                onDragLeave={() => setIsDrag(false)}
                onDrop={handleDrop}
              >
                <span className="material-symbols-outlined text-5xl block mb-2 text-primary/70">upload_file</span>
                <p className="text-sm font-medium text-on-surface mb-1">Clique ou arraste o arquivo XML da NF-e</p>
                <p className="text-xs text-on-surface-variant">Aceita <code className="bg-surface-variant px-1 rounded">.xml</code> até 10 MB</p>
              </label>
            ) : (
              <div className="bg-green-50 border-2 border-green-400/60 rounded-xl p-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-3xl text-green-600">description</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">{arquivo.name}</p>
                  <p className="text-xs text-on-surface-variant">{(arquivo.size / 1024).toFixed(1)} KB</p>
                </div>
                <button type="button" onClick={() => { setArquivo(null); if (fileRef.current) fileRef.current.value = ''; }}
                  className="text-xs text-red-600 hover:text-red-700 bg-red-100 hover:bg-red-200 px-2 py-1 rounded-lg transition">
                  Trocar
                </button>
              </div>
            )}

            {/* Barra de progresso */}
            {isPending && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-on-surface-variant">
                  <span>Processando XML...</span><span>{progresso}%</span>
                </div>
                <div className="w-full bg-surface-variant rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progresso}%` }} />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-outline-variant pt-4">
              <button type="button" onClick={handleClose} disabled={isPending} className="btn-outline">Cancelar</button>
              <button type="button" onClick={() => arquivo && importar(arquivo)} disabled={!arquivo || isPending}
                className="btn-primary flex items-center gap-2">
                {isPending
                  ? <><span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>Processando...</>
                  : <><span className="material-symbols-outlined text-[18px]">cloud_upload</span>Importar NF-e</>}
              </button>
            </div>
          </>
        )}

        {etapa === 'resultado' && resultado && (
          <>
            {/* Resumo da NF-e importada */}
            <div className="bg-surface-container-low rounded-xl p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-green-600 text-[22px]">check_circle</span>
                <span className="font-semibold text-on-surface">NF-e importada com sucesso</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><span className="label">Número</span><p className="font-mono">{resultado.numero}-{resultado.serie}</p></div>
                <div><span className="label">Valor Total</span><p className="font-semibold">{formatCurrency(resultado.valorTotal)}</p></div>
                <div><span className="label">Itens</span>
                  <p>{resultado.totalItens} ({resultado.itensIdentificados} identificado{resultado.itensIdentificados !== 1 ? 's' : ''})</p>
                </div>
              </div>
            </div>

            {/* Status do fornecedor */}
            <FornecedorStatusCard
              identificado={resultado.fornecedorIdentificado}
              fornecedor={resultado.fornecedor}
              cnpjEmitente={resultado.cnpjEmitente}
              nomeEmitente={resultado.nomeEmitente}
            />

            {/* Pedidos sugeridos */}
            {resultado.pedidosSugeridos?.length > 0 && (
              <PedidoSugeridoCard
                nfeId={resultado.id}
                pedidos={resultado.pedidosSugeridos}
                onVinculado={() => handleProsseguir()}
                onPular={handleProsseguir}
              />
            )}

            {/* Itens não identificados */}
            {resultado.itensIdentificados < resultado.totalItens && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <span className="material-symbols-outlined text-amber-600 shrink-0 text-[18px]">warning</span>
                <div>
                  <strong>{resultado.totalItens - resultado.itensIdentificados} produto(s)</strong> não foram identificados automaticamente.
                  Você poderá associá-los na tela de conferência.
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-outline-variant pt-4">
              <button type="button" onClick={handleClose} className="btn-outline">Fechar</button>
              <button type="button" onClick={handleProsseguir} className="btn-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">fact_check</span>
                Ir para Conferência
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
