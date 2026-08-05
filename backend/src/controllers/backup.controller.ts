import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { runBackup, listarBackups, exportarSistema, restaurarSistema, getBackupDir, getUploadTempDir } from '../utils/backup';
import { logEvent } from '../utils/logger';
import { AuthRequest } from '../middlewares/auth.middleware';
import { AppError } from '../utils/AppError';

// Multer: uploads temporários na pasta de trabalho do backend
// Evita usar os.tmpdir() que no Windows Service retorna C:\Windows\Temp (sem permissão de escrita)
export const uploadBackup = multer({
  dest: getUploadTempDir(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
});

export async function executarBackup(req: AuthRequest, res: Response): Promise<void> {
  const result = await runBackup(req.usuario?.id);
  res.json({
    mensagem: 'Backup realizado com sucesso',
    arquivo: path.basename(result.arquivo),
    tamanho_bytes: result.tamanho_bytes,
    duracao_ms: result.duracao_ms,
  });
}

export async function listar(_req: AuthRequest, res: Response): Promise<void> {
  const backups = listarBackups();
  res.json(backups);
}

export async function downloadBackup(req: AuthRequest, res: Response): Promise<void> {
  const nomeParam = (req.params.nome || req.query.nome || '') as string;
  const safeName = path.basename(nomeParam);

  if (!safeName || (!safeName.endsWith('.zip') && !safeName.endsWith('.backup') && !safeName.endsWith('.sql'))) {
    throw new AppError('Nome de arquivo inválido', 400);
  }

  const backupDir = getBackupDir();
  const filePath = path.join(backupDir, safeName);

  if (!fs.existsSync(filePath)) {
    throw new AppError('Arquivo de backup não encontrado', 404);
  }

  res.download(filePath, safeName);
}

export async function exportar(req: AuthRequest, res: Response): Promise<void> {
  const result = await exportarSistema(req.usuario?.id);

  logEvent({
    nivel: 'info',
    modulo: 'backup',
    mensagem: 'Download de exportação iniciado',
    usuario: req.usuario?.id,
    dados: { arquivo: path.basename(result.arquivo) },
  });

  res.download(result.arquivo, path.basename(result.arquivo));
}

export async function restaurar(req: AuthRequest, res: Response): Promise<void> {
  // Proteção contra chamada acidental
  if (req.headers['x-confirm'] !== 'true') {
    throw new AppError(
      'Operação destrutiva requer header X-Confirm: true',
      400
    );
  }

  const file = req.file;
  if (!file) throw new AppError('Arquivo de backup não enviado ou formato inválido', 400);

  try {
    const result = await restaurarSistema(file.path, req.usuario?.id, file.originalname);
    res.json(result);
  } finally {
    if (file?.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (_) {}
    }
  }
}
