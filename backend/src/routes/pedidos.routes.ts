import { Router } from 'express';
import * as ctrl from '../controllers/pedidos.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar, autorizar('ADMINISTRADOR', 'GERENTE'));

router.get('/dashboard', ctrl.dashboard);
router.get('/',          ctrl.listar);
router.get('/:id',       ctrl.buscarPorId);
router.post('/',         ctrl.criar);
router.put('/:id',       ctrl.atualizar);
router.post('/:id/abrir',   ctrl.abrir);
router.post('/:id/enviar',  ctrl.enviar);
router.post('/:id/cancelar', ctrl.cancelar);

export default router;
