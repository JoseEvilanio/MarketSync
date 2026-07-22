import { Router } from 'express';
import * as ctrl from '../controllers/clientes.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar);

// Caixa pode listar/buscar (necessário para selecionar cliente no PDV)
router.get('/', ctrl.listar);
router.get('/:id', ctrl.buscarPorId);

// Criação e edição — somente Gerente e Admin
router.post('/', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.criar);
router.put('/:id', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.atualizar);
router.delete('/:id', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.remover);

export default router;
