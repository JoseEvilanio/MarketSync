import { PrismaClient } from '@prisma/client';
// Importar appConfig garante que o .env e o config.json foram lidos
// e que DATABASE_URL foi injetado em process.env ANTES de o PrismaClient
// ser instanciado (evita usar credenciais em branco de uma sessão anterior).
import { buildDatabaseUrl, appConfig } from './appConfig';

// Garantir que DATABASE_URL está definido com as credenciais corretas
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = buildDatabaseUrl(appConfig);
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: buildDatabaseUrl(appConfig),
    },
  },
});

export default prisma;
