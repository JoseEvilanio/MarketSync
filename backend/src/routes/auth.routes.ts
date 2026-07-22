import { Router } from 'express';
import { login, perfil, alterarSenha } from '../controllers/auth.controller';
import { autenticar } from '../middlewares/auth.middleware';

const router = Router();

router.post('/login', login);
router.get('/perfil', autenticar, perfil);
router.put('/senha', autenticar, alterarSenha);

export default router;
