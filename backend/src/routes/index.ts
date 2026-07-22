import { Router } from 'express';
import authRoutes from './auth.routes';
import usuariosRoutes from './usuarios.routes';
import produtosRoutes from './produtos.routes';
import categoriasRoutes from './categorias.routes';
import marcasRoutes from './marcas.routes';
import clientesRoutes from './clientes.routes';
import fornecedoresRoutes from './fornecedores.routes';
import caixaRoutes from './caixa.routes';
import vendasRoutes from './vendas.routes';
import estoqueRoutes from './estoque.routes';
import comprasRoutes from './compras.routes';
import relatoriosRoutes from './relatorios.routes';
import backupRoutes from './backup.routes';
import configuracoesRoutes from './configuracoes.routes';
import configRoutes from './config.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/produtos', produtosRoutes);
router.use('/categorias', categoriasRoutes);
router.use('/marcas', marcasRoutes);
router.use('/clientes', clientesRoutes);
router.use('/fornecedores', fornecedoresRoutes);
router.use('/caixa', caixaRoutes);
router.use('/vendas', vendasRoutes);
router.use('/estoque', estoqueRoutes);
router.use('/compras', comprasRoutes);
router.use('/relatorios', relatoriosRoutes);
router.use('/backup', backupRoutes);
router.use('/configuracoes', configuracoesRoutes);
router.use('/config', configRoutes);

export default router;
