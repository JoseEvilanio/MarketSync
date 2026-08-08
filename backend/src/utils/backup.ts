import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { promisify } from 'util';
import cron from 'node-cron';
import archiver from 'archiver';
import { logEvent } from './logger';
import { appConfig, saveConfig } from '../config/appConfig';
import { AppError } from './AppError';
import prisma from '../config/prisma';

const execAsync = promisify(exec);

// ── Credenciais do banco a partir do appConfig ────────────────────────────────

function getDbCredentials() {
  const { host, porta, nome, usuario, senha } = appConfig.database;
  return { host, port: String(porta), user: usuario, password: senha, database: nome };
}

function getPgBin(binaryName: 'pg_dump' | 'psql'): string {
  if (process.platform !== 'win32') return binaryName;

  const possiblePaths = [
    `C:\\Program Files\\PostgreSQL\\17\\bin\\${binaryName}.exe`,
    `C:\\Program Files\\PostgreSQL\\16\\bin\\${binaryName}.exe`,
    `C:\\Program Files\\PostgreSQL\\15\\bin\\${binaryName}.exe`,
    `C:\\Program Files\\PostgreSQL\\14\\bin\\${binaryName}.exe`,
    `C:\\Program Files\\PostgreSQL\\13\\bin\\${binaryName}.exe`,
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return binaryName;
}

export function getBackupDir(): string {
  const dir = appConfig.backup.diretorio;
  // Se o config.json tiver um caminho absoluto (instalação via NSIS), usa direto.
  // Caso contrário (dev / terminal), resolve relativo à raiz do backend (dois níveis acima de dist/utils/).
  if (path.isAbsolute(dir)) return dir;
  return path.resolve(__dirname, '../..', dir);
}

/**
 * Pasta temporária para uploads do Multer.
 * Usa uma subpasta dentro do diretório do backend para garantir permissão de escrita
 * tanto no terminal (dev) quanto no Windows Service instalado.
 * C:\Windows\Temp não é acessível para serviços que rodam como LocalSystem sem perfil de usuário.
 */
export function getUploadTempDir(): string {
  const dir = path.resolve(__dirname, '../../uploads-temp');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function fileMd5(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(buf).digest('hex');
}

/**
 * Compacta um arquivo em ZIP usando archiver.
 * Retorna o caminho do ZIP gerado.
 */
async function compactarEmZip(sourcePath: string, destZip: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destZip);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.file(sourcePath, { name: path.basename(sourcePath) });
    archive.finalize();
  });
}

/**
 * Remove arquivos acima do limite de rotação (mantém os N mais recentes).
 */
function rotacionarBackups(dir: string, prefixo: string, extensao: string, max: number): void {
  const arquivos = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefixo) && f.endsWith(extensao))
    .map((f) => ({ nome: f, mtime: fs.statSync(path.join(dir, f)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  if (arquivos.length > max) {
    arquivos.slice(max).forEach(({ nome }) => {
      fs.unlinkSync(path.join(dir, nome));
      logEvent({ nivel: 'info', modulo: 'backup', mensagem: `Backup antigo removido: ${nome}` });
    });
  }
}

// ── Backup principal ──────────────────────────────────────────────────────────

export interface BackupResult {
  arquivo: string;
  tamanho_bytes: number;
  duracao_ms: number;
}

/**
 * Executa pg_dump, compacta em ZIP e rotaciona backups antigos.
 */
export async function runBackup(usuario?: string): Promise<BackupResult> {
  const inicio = Date.now();
  const { host, port, user, password, database } = getDbCredentials();
  const backupDir = getBackupDir();

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const ts = formatTimestamp();
  const sqlFile = path.join(backupDir, `backup_${database}_${ts}.sql`);
  const zipFile = path.join(backupDir, `backup_mercadopro_${ts}.zip`);

  logEvent({ nivel: 'info', modulo: 'backup', mensagem: 'Iniciando backup...', usuario });

  const pgDumpBin = getPgBin('pg_dump');

  const cmd = `"${pgDumpBin}" -h ${host} -p ${port} -U ${user} -d ${database} -f "${sqlFile}"`;
  process.env.PGPASSWORD = password;

  try {
    await execAsync(cmd);

    // Compactar em ZIP
    await compactarEmZip(sqlFile, zipFile);

    // Remover SQL temporário
    fs.unlinkSync(sqlFile);

    const tamanho_bytes = fs.statSync(zipFile).size;
    const duracao_ms = Date.now() - inicio;

    // Rotacionar: manter apenas os últimos N backups
    rotacionarBackups(backupDir, 'backup_mercadopro_', '.zip', appConfig.backup.maximo);

    logEvent({
      nivel: 'info',
      modulo: 'backup',
      mensagem: `Backup concluído: ${path.basename(zipFile)}`,
      usuario,
      dados: { arquivo: path.basename(zipFile), tamanho_bytes, duracao_ms },
    });

    return { arquivo: zipFile, tamanho_bytes, duracao_ms };
  } catch (error) {
    logEvent({
      nivel: 'error',
      modulo: 'backup',
      mensagem: `Falha no backup: ${(error as Error).message}`,
      usuario,
    });
    throw error;
  } finally {
    delete process.env.PGPASSWORD;
    // Limpar SQL se falhou antes de ser removido
    if (fs.existsSync(sqlFile)) fs.unlinkSync(sqlFile);
  }
}

// ── Listar backups ────────────────────────────────────────────────────────────

export interface BackupInfo {
  nome: string;
  tamanho: number;
  data: Date;
}

export function listarBackups(): BackupInfo[] {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) return [];

  return fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('backup_mercadopro_') && f.endsWith('.zip'))
    .map((f) => {
      const stat = fs.statSync(path.join(backupDir, f));
      return { nome: f, tamanho: stat.size, data: stat.mtime };
    })
    .sort((a, b) => b.data.getTime() - a.data.getTime());
}

// ── Agendamento cron ──────────────────────────────────────────────────────────

export function agendarBackup(): void {
  const [hora, minuto] = appConfig.backup.hora.split(':').map(Number);
  const expressao = `${minuto} ${hora} * * *`;

  cron.schedule(expressao, async () => {
    logEvent({ nivel: 'info', modulo: 'backup', mensagem: 'Iniciando backup automático agendado...' });
    try {
      const result = await runBackup();
      logEvent({
        nivel: 'info',
        modulo: 'backup',
        mensagem: `Backup automático concluído: ${path.basename(result.arquivo)}`,
        dados: { arquivo: result.arquivo, tamanho_bytes: result.tamanho_bytes, duracao_ms: result.duracao_ms },
      });
    } catch (err) {
      logEvent({ nivel: 'error', modulo: 'backup', mensagem: `Falha no backup automático: ${(err as Error).message}` });
    }
  });

  logEvent({
    nivel: 'info',
    modulo: 'backup',
    mensagem: `Backup automático agendado para ${appConfig.backup.hora} diariamente`,
  });
}

// ── Exportação completa do sistema ────────────────────────────────────────────

export interface ExportResult {
  arquivo: string;
  tamanho_bytes: number;
  duracao_ms: number;
}

/**
 * Gera um pacote .backup contendo:
 * - dump SQL do banco
 * - config.json (com senha mascarada)
 * - pasta uploads/logos
 * - metadata.json com versão e hash
 */
export async function exportarSistema(usuario?: string): Promise<ExportResult> {
  const inicio = Date.now();
  const tempDir = path.join(getUploadTempDir(), `export_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  logEvent({ nivel: 'info', modulo: 'backup', mensagem: 'Iniciando exportação completa do sistema...', usuario });

  const { host, port, user, password, database } = getDbCredentials();
  const sqlFile = path.join(tempDir, `${database}.sql`);

  const pgDumpBin = getPgBin('pg_dump');

  process.env.PGPASSWORD = password;

  try {
    // 1. pg_dump
    await execAsync(`"${pgDumpBin}" -h ${host} -p ${port} -U ${user} -d ${database} -f "${sqlFile}"`);

    // 2. Hash MD5 do dump para integridade
    const dumpHash = fileMd5(sqlFile);

    // 3. config.json com senha mascarada
    const configSafe = { ...appConfig, database: { ...appConfig.database, senha: '***' } };
    fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify(configSafe, null, 2));

    // 4. metadata.json
    const metadata = {
      versao: appConfig.sistema.versao,
      exportadoEm: new Date().toISOString(),
      banco: database,
      hash_md5_dump: dumpHash,
    };
    fs.writeFileSync(path.join(tempDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    // 5. Copiar uploads (se existir)
    const uploadsDir = path.resolve(__dirname, '../../uploads');
    if (fs.existsSync(uploadsDir)) {
      copiarDiretorio(uploadsDir, path.join(tempDir, 'uploads'));
    }

    // 5b. Copiar XMLs de NF-e (se existir)
    const storageNfeDir = path.resolve(__dirname, '../../storage/notas-fiscais');
    if (fs.existsSync(storageNfeDir)) {
      copiarDiretorio(storageNfeDir, path.join(tempDir, 'storage', 'notas-fiscais'));
    }

    // 6. Compactar em .backup (ZIP renomeado)
    const dataSuffix = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
    const pacoteNome = `MercadoPro_${dataSuffix}.backup`;
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const pacotePath = path.join(backupDir, pacoteNome);

    await compactarDiretorioEmZip(tempDir, pacotePath);

    const tamanho_bytes = fs.statSync(pacotePath).size;
    const duracao_ms = Date.now() - inicio;

    logEvent({
      nivel: 'info',
      modulo: 'backup',
      mensagem: `Exportação concluída: ${pacoteNome}`,
      usuario,
      dados: { arquivo: pacoteNome, tamanho_bytes, duracao_ms },
    });

    return { arquivo: pacotePath, tamanho_bytes, duracao_ms };
  } finally {
    delete process.env.PGPASSWORD;
    // Limpar temp
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ── Restauração completa do sistema ──────────────────────────────────────────

export interface RestoreResult {
  sucesso: boolean;
  versaoRestaurada: string;
  mensagem: string;
}

function isZipFile(filePath: string): boolean {
  try {
    const buffer = Buffer.alloc(4);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  } catch {
    return false;
  }
}

/**
 * Restaura o sistema a partir de um arquivo .backup, .zip ou .sql:
 * - Valida se é um arquivo ZIP compacto (PK magic bytes) ou SQL puro
 * - Valida metadata.json (se presente)
 * - Restaura dump SQL
 * - Sincroniza schema do Prisma automaticamente
 * - Restaura uploads (se presentes)
 * - Atualiza config.json preservando credenciais atuais (se presente)
 */
export async function restaurarSistema(arquivoBackup: string, usuario?: string, nomeOriginal?: string): Promise<RestoreResult> {
  const tempDir = path.join(getUploadTempDir(), `restore_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  logEvent({ nivel: 'info', modulo: 'backup', mensagem: 'Iniciando restauração do sistema...', usuario });

  try {
    const isZip = isZipFile(arquivoBackup);

    // 1. Se for um arquivo compactado (ZIP/backup), descompacta
    if (isZip) {
      await extrairZip(arquivoBackup, tempDir);
    } else {
      // 2. Se for um arquivo SQL puro, copia direto para o diretório de restauração
      fs.copyFileSync(arquivoBackup, path.join(tempDir, 'restore_database.sql'));
    }

    // 2. Validar metadata.json se presente (exportação completa)
    const metaPath = path.join(tempDir, 'metadata.json');
    let meta = {
      versao: appConfig.sistema.versao,
      banco: getDbCredentials().database,
      hash_md5_dump: '',
      exportadoEm: new Date().toISOString(),
    };

    if (fs.existsSync(metaPath)) {
      try {
        const fileContent = fs.readFileSync(metaPath, 'utf-8');
        meta = JSON.parse(fileContent);

        if (meta.versao) {
          const majorAtual = parseInt(appConfig.sistema.versao.split('.')[0], 10);
          const majorBackup = parseInt(meta.versao.split('.')[0], 10);
          if (!isNaN(majorAtual) && !isNaN(majorBackup) && majorBackup !== majorAtual) {
            throw new AppError(
              `Versão incompatível: backup v${meta.versao} não pode ser restaurado em sistema v${appConfig.sistema.versao}`,
              400
            );
          }
        }
      } catch (err: any) {
        if (err instanceof AppError) throw err;
      }
    }

    // 3. Encontrar arquivo SQL
    const sqlFiles = fs.readdirSync(tempDir).filter((f) => f.endsWith('.sql'));
    if (sqlFiles.length === 0) {
      throw new AppError('Arquivo de backup inválido: dump SQL (.sql) não encontrado', 400);
    }
    const sqlFile = path.join(tempDir, sqlFiles[0]);

    // 4. Restaurar banco com psql
    const { host, port, user, password, database } = getDbCredentials();
    const psqlBin = getPgBin('psql');

    process.env.PGPASSWORD = password;

    try {
      await prisma.$disconnect().catch(() => {});

      // Garantir que a base de dados existe no PostgreSQL
      try {
        await execAsync(
          `"${psqlBin}" -h ${host} -p ${port} -U ${user} -d postgres -c "CREATE DATABASE \\"${database}\\";"`
        );
      } catch (_) {
        // Ignora erro caso o banco já exista
      }

      // Limpar todos os objetos do schema public sem precisar ser dono do schema.
      // Passamos o SQL via arquivo temporário para evitar problemas de escape
      // na linha de comando com blocos PL/pgSQL que contêm aspas e cifrões.
      const cleanupSql = `
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
  FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
    EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequence_name) || ' CASCADE';
  END LOOP;
  FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public') LOOP
    EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.table_name) || ' CASCADE';
  END LOOP;
  FOR r IN (SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) LOOP
    EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
  END LOOP;
END $$;
`.trim();

      const cleanupFile = path.join(tempDir, '_cleanup.sql');
      fs.writeFileSync(cleanupFile, cleanupSql, 'utf-8');

      try {
        await execAsync(
          `"${psqlBin}" -h ${host} -p ${port} -U ${user} -d ${database} -f "${cleanupFile}"`
        );
      } catch (cleanErr: any) {
        logEvent({ nivel: 'warn', modulo: 'backup', mensagem: `Limpeza do schema: ${cleanErr.message}` });
      }

      await execAsync(`"${psqlBin}" -h ${host} -p ${port} -U ${user} -d ${database} -f "${sqlFile}"`);

      // Sincronizar schema SOMENTE se o backup vier de versão diferente.
      // O "prisma db push --accept-data-loss" recria tabelas divergentes e APAGA dados —
      // nunca deve rodar após um restore do mesmo sistema pois desfaz exatamente o que
      // o psql acabou de restaurar.
      const versaoAtual = appConfig.sistema.versao;
      const versaoBackup = meta?.versao ?? versaoAtual;
      const majorAtual  = parseInt(versaoAtual.split('.')[0], 10);
      const majorBackup = parseInt(versaoBackup.split('.')[0], 10);
      const minorAtual  = parseInt(versaoAtual.split('.')[1] ?? '0', 10);
      const minorBackup = parseInt(versaoBackup.split('.')[1] ?? '0', 10);
      const precisaSincronizar = majorBackup < majorAtual || minorBackup < minorAtual;

      if (precisaSincronizar) {
        logEvent({ nivel: 'info', modulo: 'backup', mensagem: `Backup v${versaoBackup} → sistema v${versaoAtual}: sincronizando schema...` });
        try {
          const prismaBin = path.resolve(__dirname, '../../node_modules/.bin/prisma');
          const nodeExe   = process.execPath;
          const backendDir = path.resolve(__dirname, '../..');
          await execAsync(`"${nodeExe}" "${prismaBin}" db push --accept-data-loss`, {
            cwd: backendDir,
            env: { ...process.env },
          });
        } catch (e: any) {
          logEvent({ nivel: 'warn', modulo: 'backup', mensagem: `Aviso ao sincronizar schema: ${e.message}` });
        }
      } else {
        logEvent({ nivel: 'info', modulo: 'backup', mensagem: `Backup v${versaoBackup} mesma versão — schema não alterado, dados preservados.` });
      }

      await prisma.$connect().catch(() => {});
    } catch (err: any) {
      await prisma.$connect().catch(() => {});
      throw new AppError(`Erro na restauração do banco PostgreSQL: ${err.message || err}`, 400);
    }

    // 5. Restaurar uploads
    const uploadsBackup = path.join(tempDir, 'uploads');
    const uploadsDir = path.resolve(__dirname, '../../uploads');
    if (fs.existsSync(uploadsBackup)) {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
      copiarDiretorio(uploadsBackup, uploadsDir);
    }

    // 5b. Restaurar XMLs de NF-e
    const storageNfeBackup = path.join(tempDir, 'storage', 'notas-fiscais');
    const storageNfeDir    = path.resolve(__dirname, '../../storage/notas-fiscais');
    if (fs.existsSync(storageNfeBackup)) {
      if (!fs.existsSync(storageNfeDir)) fs.mkdirSync(storageNfeDir, { recursive: true });
      copiarDiretorio(storageNfeBackup, storageNfeDir);
    }

    // 6. Restaurar config.json preservando credenciais do banco atual
    const configBackupPath = path.join(tempDir, 'config.json');
    if (fs.existsSync(configBackupPath)) {
      const configBackup = JSON.parse(fs.readFileSync(configBackupPath, 'utf-8')) as typeof appConfig;
      const configRestaurado = {
        ...configBackup,
        database: { ...configBackup.database, senha: appConfig.database.senha },
        sistema: { ...configBackup.sistema, primeiroAcesso: false },
      };
      saveConfig(configRestaurado);
      Object.assign(appConfig, configRestaurado);
    }

    logEvent({
      nivel: 'info',
      modulo: 'backup',
      mensagem: `Restauração concluída a partir de backup v${meta.versao} de ${meta.exportadoEm}`,
      usuario,
      dados: { versaoRestaurada: meta.versao, exportadoEm: meta.exportadoEm },
    });

    return { sucesso: true, versaoRestaurada: meta.versao, mensagem: 'Sistema restaurado com sucesso' };
  } finally {
    delete process.env.PGPASSWORD;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ── Utilitários internos ──────────────────────────────────────────────────────

function copiarDiretorio(src: string, dest: string): void {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    if (fs.statSync(srcPath).isDirectory()) {
      copiarDiretorio(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function compactarDiretorioEmZip(srcDir: string, destZip: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destZip);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

async function extrairZip(zipPath: string, destDir: string): Promise<void> {
  let targetZip = zipPath;
  let tempCreated = false;

  // Multer salva o arquivo sem extensão; PowerShell Expand-Archive exige .zip
  if (!zipPath.toLowerCase().endsWith('.zip')) {
    targetZip = `${zipPath}_temp.zip`;
    fs.copyFileSync(zipPath, targetZip);
    tempCreated = true;
  }

  try {
    if (process.platform === 'win32') {
      // Usar & { } com variáveis para evitar quebra quando o caminho contém espaços
      // (ex.: C:\Program Files\MercadoPro\...). Aspas internas não resolvem esse problema
      // porque o PowerShell interpreta o caminho como comando — o operador & com bloco
      // de script garante que os literais são tratados como strings puras.
      const script = [
        `$src  = '${targetZip.replace(/'/g, "''")}'`,
        `$dest = '${destDir.replace(/'/g, "''")}'`,
        `Expand-Archive -LiteralPath $src -DestinationPath $dest -Force`,
      ].join('; ');
      await execAsync(`powershell -NoProfile -NonInteractive -Command "${script}"`);
    } else {
      await execAsync(`unzip -o "${targetZip}" -d "${destDir}"`);
    }
  } catch (err: any) {
    throw new AppError(`Falha ao descompactar arquivo de backup: ${err.message || err}`, 400);
  } finally {
    if (tempCreated && fs.existsSync(targetZip)) {
      try { fs.unlinkSync(targetZip); } catch (_) {}
    }
  }
}
