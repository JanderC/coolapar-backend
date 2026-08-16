const express = require('express');
const { query } = require('express-validator');

const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');
const reportesService = require('../../services/reportes.service');

const router = express.Router();

// @desc  Ventas del período con su rentabilidad.
// @route GET /api/reportes/ventas?fecha_inicio=&fecha_fin=&sucursal_id=
const ventas = asyncHandler(async (req, res) => {
  const datos = await reportesService.reporteVentas({
    fecha_inicio: req.query.fecha_inicio || null,
    fecha_fin: req.query.fecha_fin || null,
    sucursal_id: req.query.sucursal_id || null,
  });
  res.json({ success: true, data: datos });
});

// @desc  Cuánto cuesta producir un kilo de cada producto.
// @route GET /api/reportes/costos
const costos = asyncHandler(async (req, res) => {
  const mapa = await reportesService.costoPorProducto();
  res.json({
    success: true,
    data: [...mapa.values()].sort((a, b) => a.producto.localeCompare(b.producto, 'es')),
  });
});

router.use(proteger);
// Los números de rentabilidad son del negocio: una sucursal no los ve.
router.use(permitirRoles('admin', 'contabilidad'));

router.get(
  '/ventas',
  [query('fecha_inicio').optional().isISO8601(), query('fecha_fin').optional().isISO8601()],
  validar,
  ventas
);
router.get('/costos', costos);

module.exports = router;