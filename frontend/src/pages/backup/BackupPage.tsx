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
      setUploadProgress(0);
      setTimeout(() => window.location.reload(), 1500);
    },
    onError: () => {
      toast.error('Falha na restauração. Verifique o arquivo.');
      setUploadProgress(0);
    },
  });

  function handleRestaurar() {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error('Selecione um arquivo .backup'); return; }
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

          {/* Input de arquivo */}
          <label className="block cursor-pointer">
            <input ref={fileRef} type="file" accept=".backup" className="hidden" />
            <div className="border-2 border-dashed border-outline rounded-xl p-5 text-center hover:border-primary transition">
              <span className="material-symbols-outlined text-3xl text-on-surface-variant block mb-1">
                upload_file
              </span>
              <p className="text-sm text-on-surface-variant">
                Clique para selecionar o arquivo <code className="bg-surface-variant px-1 rounded">.backup</code>
              </p>
            </div>
          </label>

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
              onClick={() => setConfirmarRestaurar(true)}
              disabled={anyLoading}
              className="w-full border-2 border-amber-500 text-amber-700 py-2.5 rounded-xl font-semibold hover:bg-amber-50 transition disabled:opacity-60"
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
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-xl font-semibold hover:bg-red-700 transition disabled:opacity-60"
                >
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
