import { Router } from 'express';
import * as ctrl from '../controllers/notas-fiscais.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar, autorizar('ADMINISTRADOR', 'GERENTE'));

router.get('/',    ctrl.listar);
router.get('/:id', ctrl.buscarPorId);

// Importação de XML — multer aplicado só nesta rota
router.post('/importar', ctrl.uploadXml.single('arquivo'), ctrl.importar);

// Operações por NF-e
router.post('/:id/vincular-pedido',      ctrl.vincularPedido);
router.post('/:id/identificar-produto',  ctrl.identificarProduto);
router.get( '/:id/conferencia',          ctrl.getConferencia);
router.post('/:id/receber',              ctrl.receber);
router.post('/:id/cancelar',             ctrl.cancelar);

// Estorno — apenas ADMINISTRADOR
router.post('/:id/estornar', autorizar('ADMINISTRADOR'), ctrl.estornar);

export default router;
