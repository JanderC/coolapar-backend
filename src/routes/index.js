const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/configuracion', require('./configuracion.routes'));
router.use('/rutas', require('./ruta.routes'));
router.use('/productores', require('./productor.routes'));
router.use('/semanas-pago', require('./semanaPago.routes'));
router.use('/registros-leche', require('./registroLeche.routes'));
router.use('/pagos-productores', require('./pagoProductor.routes'));
router.use('/transportadores', require('./transportador.routes'));
router.use('/fletes', require('./fleteTransportador.routes'));
router.use('/recibidos', require('./recibido.routes'));
router.use('/lotes-produccion', require('./loteProduccion.routes'));
router.use('/insumos', require('./insumo.routes'));
router.use('/productos', require('./producto.routes'));
router.use('/cuarto-frio', require('./cuartoFrio.routes'));
router.use('/piezas-queso', require('./piezaQueso.routes'));
router.use('/proveedores', require('./proveedor.routes'));
router.use('/compras-proveedores', require('./compraProveedor.routes'));
router.use('/devoluciones', require('./devolucion.routes'));
router.use('/ruteros', require('./rutero.routes'));

module.exports = router;