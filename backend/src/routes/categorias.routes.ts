import { Router } from 'express';
import * as ctrl from '../controllers/categorias.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar);

router.get('/', ctrl.listar);
router.post('/', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.criar);
router.put('/:id', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.atualizar);
router.delete('/:id', autorizar('ADMINISTRADOR'), ctrl.remover);

export default router;
