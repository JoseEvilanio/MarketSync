import { Router } from 'express';
import * as ctrl from '../controllers/config.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();

// Públicos — sem autenticação
router.get('/empresa', ctrl.getEmpresa);
router.post('/setup', ctrl.setupInicial); // Wizard de primeiro acesso (só funciona com primeiroAcesso=true)

// Requer ADMINISTRADOR
router.get('/', autenticar, autorizar('ADMINISTRADOR'), ctrl.getConfig);
router.put('/', autenticar, autorizar('ADMINISTRADOR'), ctrl.updateConfig);

export default router;
