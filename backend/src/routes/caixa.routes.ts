import { Router } from 'express';
import * as ctrl from '../controllers/caixa.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar);

router.get('/atual', ctrl.caixaAtual);
router.get('/historico', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.historico);
router.post('/abrir', ctrl.abrirCaixa);
router.post('/fechar', ctrl.fecharCaixa);
router.post('/sangria', ctrl.sangria);
router.post('/suprimento', ctrl.suprimento);

export default router;
