import { Router } from 'express';
import * as ctrl from '../controllers/produtos.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar);

router.get('/', ctrl.listar);
router.get('/barras/:codigo', ctrl.buscarPorBarras);
router.get('/:id', ctrl.buscarPorId);
router.post('/', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.criar);
router.put('/massa', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.alteracaoEmMassa);
router.put('/:id', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.atualizar);
router.delete('/:id', autorizar('ADMINISTRADOR'), ctrl.remover);

export default router;
