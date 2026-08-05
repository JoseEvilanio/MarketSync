import path from 'path';
import fs from 'fs';
import { restaurarSistema } from './backup';

async function main() {
  const arquivoBackup = process.argv[2];

  if (!arquivoBackup) {
    console.error('[restoreHelper] Erro: Nenhum arquivo de backup informado.');
    process.exit(1);
  }

  const resolvedPath = path.resolve(arquivoBackup);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`[restoreHelper] Erro: Arquivo de backup não encontrado: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`[restoreHelper] Iniciando restauração do backup: ${resolvedPath}`);

  try {
    const result = await restaurarSistema(resolvedPath, 'instalador_nsis', path.basename(resolvedPath));
    console.log(`[restoreHelper] Sucesso: ${result.mensagem} (Versão: ${result.versaoRestaurada || 'desconhecida'})`);
    process.exit(0);
  } catch (error: any) {
    console.error(`[restoreHelper] Erro ao restaurar backup: ${error.message || error}`);
    process.exit(1);
  }
}

main();
