import { Router } from 'express';
import * as ctrl from '../controllers/estoque.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar);

router.get('/historico', ctrl.historico);
router.get('/critico', ctrl.produtosEstoqueBaixo);
router.get('/inventario', ctrl.inventario);
router.post('/ajuste', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.ajustarEstoque);

export default router;
