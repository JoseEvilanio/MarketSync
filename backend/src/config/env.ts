import { appConfig, buildDatabaseUrl } from './appConfig';

// Todas as configurações são lidas do appConfig (config.json) com fallback para .env
export const env = {
  PORT: appConfig.api.porta,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: buildDatabaseUrl(appConfig),
  JWT_SECRET:
    process.env.JWT_SECRET ||
    'marketsync_jwt_secret_chave_muito_forte_2026_erp',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || appConfig.sistema?.versao ? '8h' : '8h',
  BACKUP_DIR: appConfig.backup.diretorio,
};
