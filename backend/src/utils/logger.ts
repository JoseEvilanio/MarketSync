import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Importação lazy para evitar dependência circular com appConfig
function getLogDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { appConfig } = require('../config/appConfig') as { appConfig: { sistema: { logDir: string } } };
    return path.resolve(__dirname, '../..', appConfig.sistema.logDir);
  } catch {
    return path.join(__dirname, '../logs');
  }
}

const logDir = getLogDir();
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5 MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 10,
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

// ── Interface de log estruturado ──────────────────────────────────────────────

export interface LogEntry {
  nivel: 'info' | 'warn' | 'error';
  modulo: string;         // 'backup' | 'auth' | 'venda' | 'migracao' | 'sistema' | ...
  mensagem: string;
  usuario?: string;       // e-mail do usuário, quando aplicável
  dados?: Record<string, unknown>; // duração, tamanho, arquivo, etc.
}

/**
 * Registra um evento estruturado no log.
 * Usa os campos `modulo`, `usuario` e `dados` como metadata.
 */
export function logEvent(entry: LogEntry): void {
  const { nivel, modulo, mensagem, usuario, dados } = entry;
  logger.log(nivel, mensagem, {
    modulo,
    ...(usuario ? { usuario } : {}),
    ...(dados ? { dados } : {}),
  });
}

export default logger;
