import { Router } from 'express';
import * as ctrl from '../controllers/compras.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar, autorizar('ADMINISTRADOR', 'GERENTE'));

router.get('/', ctrl.listar);
router.get('/:id', ctrl.buscarPorId);
router.post('/', ctrl.criar);
router.post('/:id/concluir', ctrl.concluir);
router.post('/:id/cancelar', ctrl.cancelar);

export default router;
