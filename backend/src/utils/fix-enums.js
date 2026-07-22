const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const r1 = await prisma.$executeRawUnsafe(`UPDATE produtos SET "tipoVenda" = 'UNIDADE' WHERE "tipoVenda" IS NULL`);
  console.log('tipoVenda atualizados:', r1);
  const r2 = await prisma.$executeRawUnsafe(`UPDATE produtos SET "modoPesagem" = 'MANUAL' WHERE "modoPesagem" IS NULL`);
  console.log('modoPesagem atualizados:', r2);
}

main()
  .catch((e) => console.error('Erro ao atualizar enums:', e))
  .finally(() => prisma.$disconnect());
