import { Router } from 'express';
import * as ctrl from '../controllers/marcas.controller';
import { autenticar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar);
router.get('/', ctrl.listar);
router.post('/', ctrl.criar);

export default router;
