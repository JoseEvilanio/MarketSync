import { Router } from 'express';
import * as ctrl from '../controllers/recebimentos.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar, autorizar('ADMINISTRADOR', 'GERENTE'));

router.get('/',                        ctrl.listar);
router.get('/divergencias',            ctrl.listarDivergencias);
router.get('/:id',                     ctrl.buscarPorId);
router.post('/divergencias/:id/resolver', ctrl.resolverDivergencia);

export default router;
