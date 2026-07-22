import { Router } from 'express';
import * as ctrl from '../controllers/usuarios.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar, autorizar('ADMINISTRADOR'));

router.get('/', ctrl.listar);
router.post('/', ctrl.criar);
router.get('/:id', ctrl.buscarPorId);
router.put('/:id', ctrl.atualizar);
router.delete('/:id', ctrl.remover);

export default router;
