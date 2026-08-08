import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Carregar .env antes de tudo (necessário para Prisma CLI e compatibilidade).
//
// O caminho de __dirname muda conforme o ambiente:
//   - Desenvolvimento (ts-node):  src/config/  → sobe 2 níveis → raiz do backend ✓
//   - Build compilado (node dist): dist/config/ → sobe 2 níveis → raiz do backend ✓
//
// Mas quando o NSSM define CONFIG_PATH via AppEnvironmentExtra, o .env pode estar
// tanto em dist/config/../../.env quanto já estar ausente (vars vieram pelo NSSM).
// Por isso tentamos os dois caminhos candidatos antes de desistir.
(function carregarDotEnv() {
  const candidatos = [
    path.resolve(__dirname, '../../.env'),   // src/config ou dist/config → raiz backend
    path.resolve(__dirname, '../../../.env'), // caso raro onde __dirname resolve diferente
  ];
  for (const p of candidatos) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      break;
    }
  }
  // Se nenhum arquivo .env existir (serviço NSSM injeta vars diretamente), ok — segue adiante.
})();

export interface AppConfig {
  empresa: string;
  api: {
    host: string;
    porta: number;
  };
  database: {
    host: string;
    porta: number;
    nome: string;
    usuario: string;
    senha: string;
  };
  backup: {
    diretorio: string;
    hora: string;
    maximo: number;
  };
  impressora: {
    cupom: string;
    etiquetas: string;
  };
  sistema: {
    primeiroAcesso: boolean;
    versao: string;
    logDir: string;
  };
}

// Caminho padrão: CONFIG_PATH (env var) ou config/config.json relativo ao backend
const CONFIG_PATH =
  process.env.CONFIG_PATH ||
  path.resolve(__dirname, '../../config/config.json');

function buildConfigFromEnv(): AppConfig {
  const dbUrl = process.env.DATABASE_URL || '';
  let dbHost = 'localhost';
  let dbPorta = 5432;
  let dbNome = 'mercadopro';
  let dbUsuario = 'postgres';
  let dbSenha = '';

  try {
    if (dbUrl) {
      const u = new URL(dbUrl);
      dbHost = u.hostname;
      dbPorta = parseInt(u.port || '5432', 10);
      dbNome = u.pathname.slice(1);
      dbUsuario = u.username;
      dbSenha = u.password;
    }
  } catch {
    // mantém defaults
  }

  return {
    empresa: 'Mercadinho Local',
    api: {
      host: 'localhost',
      porta: parseInt(process.env.PORT || '3001', 10),
    },
    database: {
      host: dbHost,
      porta: dbPorta,
      nome: dbNome,
      usuario: dbUsuario,
      senha: dbSenha,
    },
    backup: {
      diretorio: process.env.BACKUP_DIR || '../backups',
      hora: '22:00',
      maximo: 30,
    },
    impressora: { cupom: '', etiquetas: '' },
    sistema: {
      primeiroAcesso: true,
      versao: '2.0.0',
      logDir: '../logs',
    },
  };
}

function loadConfig(): AppConfig {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as AppConfig;
      return parsed;
    } catch (err) {
      console.warn(
        `[appConfig] Falha ao ler ${CONFIG_PATH}, usando variáveis de ambiente. Erro: ${err}`
      );
    }
  }
  return buildConfigFromEnv();
}

export function saveConfig(config: AppConfig): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');

  // Atualizar DATABASE_URL no processo para o Prisma refletir mudanças em runtime
  process.env.DATABASE_URL = buildDatabaseUrl(config);
}

export function buildDatabaseUrl(config: AppConfig): string {
  const { host, porta, nome, usuario, senha } = config.database;
  return `postgresql://${encodeURIComponent(usuario)}:${encodeURIComponent(senha)}@${host}:${porta}/${nome}`;
}

// Singleton carregado na inicialização do processo
export const appConfig: AppConfig = loadConfig();

// Sincronizar DATABASE_URL com config.json (garante que Prisma use os dados corretos)
if (fs.existsSync(CONFIG_PATH)) {
  process.env.DATABASE_URL = buildDatabaseUrl(appConfig);
}
