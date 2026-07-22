import { Router } from 'express';
import * as ctrl from '../controllers/backup.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar, autorizar('ADMINISTRADOR'));

router.get('/', ctrl.listar);
router.get('/download/:nome', ctrl.downloadBackup);
router.post('/executar', ctrl.executarBackup);
router.post('/exportar-sistema', ctrl.exportar);
router.post(
  '/restaurar-sistema',
  ctrl.uploadBackup.single('arquivo'),
  ctrl.restaurar
);

export default router;
