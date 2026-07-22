import { Router } from 'express';
import * as ctrl from '../controllers/relatorios.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar);

router.get('/dashboard', ctrl.dashboard);
router.get('/vendas/periodo', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.vendasPorPeriodo);
router.get('/vendas/produtos', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.vendasPorProduto);
router.get('/vendas/operadores', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.vendasPorOperador);
router.get('/estoque/critico', ctrl.estoqueCritico);
router.get('/caixa', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.caixaRelatorio);

export default router;
