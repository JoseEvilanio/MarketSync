import { Router } from 'express';
import * as ctrl from '../controllers/notas-fiscais.controller';
import { autenticar, autorizar } from '../middlewares/auth.middleware';

const router = Router();
router.use(autenticar, autorizar('ADMINISTRADOR', 'GERENTE'));

// Importação de XML (multer aplicado apenas nesta rota)
router.post('/importar',          ctrl.uploadXml.single('arquivo'), ctrl.importar);

// Busca direta pela chave de acesso (antes de /:id para não conflitar)
router.get('/chave/:chave',        ctrl.buscarPorChave);

// Listagem e detalhe
router.get('/',                    ctrl.listar);
router.get('/:id',                 ctrl.buscarPorId);

// Operações por NF-e
router.post('/:id/vincular-pedido',     ctrl.vincularPedido);
router.post('/:id/identificar-produto', ctrl.identificarProduto);
router.get( '/:id/conferencia',         ctrl.getConferencia);
router.post('/:id/receber',             ctrl.receber);
router.post('/:id/cancelar',            ctrl.cancelar);

// Eventos (linha do tempo)
router.get('/:id/eventos',             ctrl.listarEventos);

// Download do XML com verificação de integridade
router.get('/:id/xml',                 ctrl.downloadXml);

// Estorno — apenas ADMINISTRADOR
router.post('/:id/estornar', autorizar('ADMINISTRADOR'), ctrl.estornar);

export default router;
