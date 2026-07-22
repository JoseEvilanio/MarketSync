import { Router } from 'express';
import * as ctrl from '../controllers/configuracoes.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar);
router.get('/', ctrl.listar);
router.put('/', autorizar('ADMINISTRADOR'), ctrl.atualizar);

export default router;
