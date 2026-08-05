import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { backupService } from '@/services/api';

interface BackupInfo {
  nome: string;
  tamanho: number;
  data: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function BackupPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [confirmarRestaurar, setConfirmarRestaurar] = useState(false);

  // ── Listar backups ──────────────────────────────────────────────────────────
  const { data: backups = [], isLoading } = useQuery<BackupInfo[]>({
    queryKey: ['backups'],
    queryFn: () => backupService.listar(),
    refetchInterval: 30_000,
  });

  // ── Download de arquivo específico ──────────────────────────────────────────
  const [downloadingName, setDownloadingName] = useState<string | null>(null);

  const baixarArquivo = async (nome: string) => {
    try {
      setDownloadingName(nome);
      const blob = await backupService.download(nome);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Download do arquivo iniciado!`);
    } catch {
      toast.error('Falha ao baixar o arquivo de backup.');
    } finally {
      setDownloadingName(null);
    }
  };

  // ── Backup manual ───────────────────────────────────────────────────────────
  const { mutate: fazerBackup, isPending: backupPending } = useMutation({
    mutationFn: () => backupService.executar(),
    onSuccess: (res) => {
      toast.success('Backup realizado com sucesso!');
      qc.invalidateQueries({ queryKey: ['backups'] });
      if (res?.arquivo) {
        baixarArquivo(res.arquivo);
      }
    },
    onError: () => toast.error('Falha ao realizar backup.'),
  });

  // ── Exportar sistema ────────────────────────────────────────────────────────
  const { mutate: exportar, isPending: exportPending } = useMutation({
    mutationFn: () => backupService.exportarSistema(),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const data = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
      a.href = url;
      a.download = `MercadoPro_${data}.backup`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exportação concluída! Download iniciado.');
    },
    onError: () => toast.error('Falha ao exportar o sistema.'),
  });

  // ── Restaurar sistema ───────────────────────────────────────────────────────
  const { mutate: restaurar, isPending: restorePending } = useMutation({
    mutationFn: (file: File) =>
      backupService.restaurarSistema(file, (pct) => setUploadProgress(pct)),
    onSuccess: () => {
      toast.success('Sistema restaurado! Recarregando...');
      setConfirmarRestaurar(false);
      setSelectedFile(null);
      setUploadProgress(0);
      setTimeout(() => window.location.reload(), 1500);
    },
    onError: (error: any) => {
      const mensagem = error?.response?.data?.erro || 'Falha na restauração. Verifique o arquivo.';
      toast.error(mensagem);
      setUploadProgress(0);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setConfirmarRestaurar(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const name = file.name.toLowerCase();
      if (name.endsWith('.backup') || name.endsWith('.zip') || name.endsWith('.sql')) {
        setSelectedFile(file);
        setConfirmarRestaurar(false);
      } else {
        toast.error('Selecione um arquivo .backup, .zip ou .sql válido');
      }
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setConfirmarRestaurar(false);
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  };

  function handleRestaurar() {
    const file = selectedFile || fileRef.current?.files?.[0];
    if (!file) {
      toast.error('Selecione um arquivo .backup ou .zip antes de continuar.');
      return;
    }
    restaurar(file);
  }

  const anyLoading = backupPending || exportPending || restorePending;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Backup e Utilitários</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Gerencie backups, exporte ou restaure o sistema completo.
        </p>
      </div>

      {/* ── Ações principais ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Backup agora */}
        <button
          onClick={() => fazerBackup()}
          disabled={anyLoading}
          className="flex items-center gap-3 bg-primary text-white px-5 py-4 rounded-xl font-semibold hover:bg-primary/90 transition disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-2xl">backup</span>
          <div className="text-left">
            <p className="text-sm font-bold">Fazer Backup Agora</p>
            <p className="text-xs opacity-80">Gera e baixa o arquivo .zip</p>
          </div>
          {backupPending && (
            <span className="material-symbols-outlined animate-spin ml-auto text-xl">
              progress_activity
            </span>
          )}
        </button>

        {/* Exportar sistema */}
        <button
          onClick={() => exportar()}
          disabled={anyLoading}
          className="flex items-center gap-3 bg-secondary text-on-secondary px-5 py-4 rounded-xl font-semibold hover:bg-secondary/90 transition disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-2xl">download</span>
          <div className="text-left">
            <p className="text-sm font-bold">Exportar Sistema</p>
            <p className="text-xs opacity-80">Baixa pacote .backup completo</p>
          </div>
          {exportPending && (
            <span className="material-symbols-outlined animate-spin ml-auto text-xl">
              progress_activity
            </span>
          )}
        </button>
      </div>

      {/* ── Histórico de backups ── */}
      <div className="bg-white rounded-xl border border-outline shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-outline flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">history</span>
          <h2 className="font-semibold text-on-surface">Histórico de Backups</h2>
          <span className="ml-auto text-xs text-on-surface-variant">
            {backups.length} arquivo{backups.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">
              progress_activity
            </span>
          </div>
        ) : backups.length === 0 ? (
          <div className="py-10 text-center text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl block mb-2">folder_off</span>
            Nenhum backup encontrado. Clique em "Fazer Backup Agora" para criar o primeiro.
          </div>
        ) : (
          <div className="divide-y divide-outline-variant">
            {backups.map((b) => (
              <div key={b.nome} className="px-5 py-3 flex items-center gap-4">
                <span className="material-symbols-outlined text-on-surface-variant">archive</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">{b.nome}</p>
                  <p className="text-xs text-on-surface-variant">{formatDate(b.data)}</p>
                </div>
                <span className="text-xs text-on-surface-variant whitespace-nowrap">
                  {formatBytes(b.tamanho)}
                </span>
                <button
                  onClick={() => baixarArquivo(b.nome)}
                  disabled={downloadingName === b.nome}
                  className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                  title="Baixar arquivo de backup para o seu computador"
                >
                  {downloadingName === b.nome ? (
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[16px]">download</span>
                  )}
                  Baixar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Restaurar sistema ── */}
      <div className="bg-white rounded-xl border border-outline shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-outline flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-600">restore</span>
          <h2 className="font-semibold text-on-surface">Restaurar Sistema</h2>
        </div>

        <div className="p-5 space-y-4">
          {/* Aviso destrutivo */}
          <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <span className="material-symbols-outlined text-amber-600 shrink-0">warning</span>
            <p className="text-sm text-amber-800">
              <strong>Atenção:</strong> Esta operação substituirá <strong>todos os dados atuais</strong>{' '}
              do sistema pelo conteúdo do arquivo selecionado. Esta ação não pode ser desfeita.
            </p>
          </div>

          {/* Input de arquivo — hidden, ativado pelo label via htmlFor ou por fileRef.click() */}
          <input
            id="backup-file-input"
            ref={fileRef}
            type="file"
            accept=".backup,.zip,.sql"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Zona de drop — só visível quando nenhum arquivo foi selecionado */}
          {!selectedFile ? (
            // htmlFor conecta o label ao input pelo id — clique em qualquer parte
            // da zona abre o seletor de arquivos sem depender de posicionamento DOM.
            <label
              htmlFor="backup-file-input"
              className={`block cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition ${
                isDragging
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-outline hover:border-primary text-on-surface-variant'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <span className="material-symbols-outlined text-4xl block mb-2 text-primary/80">
                cloud_upload
              </span>
              <p className="text-sm font-medium text-on-surface mb-1">
                Clique para selecionar ou arraste o arquivo de backup aqui
              </p>
              <p className="text-xs text-on-surface-variant">
                Aceita arquivos{' '}
                <code className="bg-surface-variant px-1.5 py-0.5 rounded text-primary font-mono font-semibold">.backup</code>,{' '}
                <code className="bg-surface-variant px-1.5 py-0.5 rounded text-primary font-mono font-semibold">.zip</code>{' '}
                ou{' '}
                <code className="bg-surface-variant px-1.5 py-0.5 rounded text-primary font-mono font-semibold">.sql</code>
              </p>
            </label>
          ) : (
            // Fora do label — cliques aqui nunca abrem o seletor de arquivos
            <div className="bg-green-50/90 border-2 border-green-500/50 rounded-xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl text-green-700">
                  folder_zip
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-green-700 bg-green-200/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    Arquivo selecionado
                  </span>
                </div>
                <p className="text-sm font-semibold text-on-surface truncate mt-1">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-on-surface-variant">
                  Tamanho:{' '}
                  <span className="font-medium text-on-surface">{formatBytes(selectedFile.size)}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={handleRemoveFile}
                className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-100 hover:bg-red-200 px-3 py-2 rounded-lg transition shrink-0"
                title="Remover e escolher outro arquivo"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                Trocar arquivo
              </button>
            </div>
          )}

          {/* Barra de progresso */}
          {uploadProgress > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-on-surface-variant">
                <span>Enviando...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-surface-variant rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Botão com confirmação */}
          {!confirmarRestaurar ? (
            <button
              onClick={() => {
                if (!selectedFile) {
                  toast.error('Selecione um arquivo .backup ou .zip antes de continuar.');
                  fileRef.current?.click();
                  return;
                }
                setConfirmarRestaurar(true);
              }}
              disabled={anyLoading}
              className={`w-full border-2 py-2.5 rounded-xl font-semibold transition disabled:opacity-60 ${
                selectedFile
                  ? 'border-amber-500 text-amber-700 bg-amber-50/50 hover:bg-amber-100/70'
                  : 'border-outline text-on-surface-variant hover:border-primary'
              }`}
            >
              Restaurar Sistema
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-center text-red-700">
                Confirma a restauração? Todos os dados atuais serão perdidos.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmarRestaurar(false)}
                  className="flex-1 border border-outline py-2.5 rounded-xl font-semibold hover:bg-surface-variant transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRestaurar}
                  disabled={restorePending}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-xl font-semibold hover:bg-red-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {restorePending && (
                    <span className="material-symbols-outlined animate-spin text-lg">
                      progress_activity
                    </span>
                  )}
                  {restorePending ? 'Restaurando...' : 'Sim, restaurar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
