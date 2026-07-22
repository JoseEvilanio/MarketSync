import { Request, Response } from 'express';
import { appConfig, saveConfig, AppConfig } from '../config/appConfig';
import { AuthRequest } from '../middlewares/auth.middleware';
import prisma from '../config/prisma';
import bcrypt from 'bcryptjs';

/**
 * GET /api/config
 * Retorna a configuração atual sem expor a senha do banco.
 * Requer perfil ADMINISTRADOR.
 */
export async function getConfig(_req: AuthRequest, res: Response): Promise<void> {
  const safe: AppConfig = {
    ...appConfig,
    database: { ...appConfig.database, senha: '***' },
  };
  res.json(safe);
}

/**
 * PUT /api/config
 * Atualiza parcialmente o config.json.
 * Requer perfil ADMINISTRADOR.
 */
export async function updateConfig(req: AuthRequest, res: Response): Promise<void> {
  const updates = req.body as Partial<AppConfig>;

  // Merge profundo das seções
  const updated: AppConfig = {
    empresa: updates.empresa ?? appConfig.empresa,
    api: { ...appConfig.api, ...(updates.api || {}) },
    database: {
      ...appConfig.database,
      ...(updates.database || {}),
      // Não sobrescreve a senha se vier mascarada
      senha:
        updates.database?.senha && updates.database.senha !== '***'
          ? updates.database.senha
          : appConfig.database.senha,
    },
    backup: { ...appConfig.backup, ...(updates.backup || {}) },
    impressora: { ...appConfig.impressora, ...(updates.impressora || {}) },
    sistema: { ...appConfig.sistema, ...(updates.sistema || {}) },
  };

  saveConfig(updated);

  // Refletir no objeto em memória
  Object.assign(appConfig, updated);

  res.json({ mensagem: 'Configuração salva com sucesso' });
}

/**
 * GET /api/config/empresa
 * Retorna apenas o nome da empresa e flag de primeiro acesso.
 * Público — sem autenticação (usado pelo wizard de first-run).
 */
export async function getEmpresa(_req: Request, res: Response): Promise<void> {
  res.json({
    empresa: appConfig.empresa,
    primeiroAcesso: appConfig.sistema.primeiroAcesso,
    versao: appConfig.sistema.versao,
  });
}

/**
 * POST /api/config/setup
 * Endpoint público para o wizard de primeiro acesso.
 * Atualiza o config.json, sincroniza o banco de dados e garante a existência de ao menos 1 usuário admin.
 */
export async function setupInicial(req: Request, res: Response): Promise<void> {
  const { empresa, impressora } = req.body as {
    empresa?: string;
    impressora?: { cupom?: string; etiquetas?: string };
  };

  const nomeEmpresa = empresa || appConfig.empresa || 'Mercadinho Local';

  const updated: AppConfig = {
    ...appConfig,
    empresa: nomeEmpresa,
    impressora: {
      cupom: impressora?.cupom ?? appConfig.impressora.cupom,
      etiquetas: impressora?.etiquetas ?? appConfig.impressora.etiquetas,
    },
    sistema: {
      ...appConfig.sistema,
      primeiroAcesso: false,
    },
  };

  saveConfig(updated);
  Object.assign(appConfig, updated);

  try {
    // Sincronizar configurações no Banco de Dados
    await prisma.configuracao.upsert({
      where: { chave: 'NOME_ESTABELECIMENTO' },
      update: { valor: nomeEmpresa },
      create: { chave: 'NOME_ESTABELECIMENTO', valor: nomeEmpresa, descricao: 'Nome do estabelecimento' },
    });

    if (impressora?.cupom) {
      await prisma.configuracao.upsert({
        where: { chave: 'IMPRESSORA_CUPOM' },
        update: { valor: impressora.cupom },
        create: { chave: 'IMPRESSORA_CUPOM', valor: impressora.cupom, descricao: 'Porta/IP da impressora de cupom' },
      });
    }

    // Garantir que exista um usuário ADMINISTRADOR padrão se nenhum existir no banco
    const adminExistente = await prisma.usuario.findFirst({
      where: { perfil: 'ADMINISTRADOR' },
    });

    if (!adminExistente) {
      const senhaHash = await bcrypt.hash('admin123', 12);
      await prisma.usuario.create({
        data: {
          nome: 'Administrador',
          email: 'admin@mercadinho.local',
          senha: senhaHash,
          perfil: 'ADMINISTRADOR',
        },
      });
    }
  } catch (dbErr) {
    console.warn('[setupInicial] Aviso ao sincronizar com banco de dados:', dbErr);
  }

  res.json({ mensagem: 'Configuração inicial salva com sucesso.' });
}

