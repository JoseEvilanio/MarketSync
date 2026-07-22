import { Router } from 'express';
import * as ctrl from '../controllers/vendas.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar);

// Registrar venda — todos (caixa, gerente, admin)
router.post('/', ctrl.registrar);
router.post('/auditoria-evento', ctrl.registrarAuditoriaEvento);

// Listar e buscar detalhes — somente Gerente e Admin
router.get('/', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.listar);
router.get('/:id', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.buscarPorId);

// Cancelar — somente Gerente e Admin
router.post('/:id/cancelar', autorizar('ADMINISTRADOR', 'GERENTE'), ctrl.cancelar);

export default router;
