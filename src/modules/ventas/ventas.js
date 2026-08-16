const express = require('express');
const { body, param, query } = require('express-validator');
const { Op } = require('sequelize');

const db = require('../../models');
const { Venta, VentaItem, Sucursal, MovimientoSucursal } = db;
const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles, alcanceSucursal, soloSucursal } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');
const ventasService = require('../../services/ventas.service');
const cuartoFrioService = require('../../services/cuartoFrio.service');

const router = express.Router();

const vacio = (v) => v === undefined || v === null || v === '';
const MONEDAS = ['BS', 'USD', 'COP'];

const conErroresDeNegocio = (manejador) =>
  asyncHandler(async (req, res, next) => {
    try {
      await manejador(req, res, next);
    } catch (err) {
      if (err.esErrorDeNegocio) return res.status(400).json({ success: false, message: err.message });
      throw err;
    }
  });

const incluirTodo = [
  { model: VentaItem, as: 'Items', required: false },
  { model: Sucursal, as: 'Sucursal', required: false, attributes: ['id', 'nombre'] },
];

// ============================================================
//  LISTADO
// ============================================================

// @desc  Ventas. Un usuario de sucursal solo ve las suyas y recortadas.
// @route GET /api/ventas?fecha_inicio=&fecha_fin=&origen=&estado_despacho=
const listar = asyncHandler(async (req, res) => {
  const where = {};

  // req.sucursalFiltro lo pone alcanceSucursal: es null para el
  // administrador y el id propio para un usuario de sucursal. Es lo que
  // impide que alcance las ventas de otra.
  if (req.sucursalFiltro !== null) where.sucursal_id = req.sucursalFiltro;

  if (!vacio(req.query.origen)) where.origen = req.query.origen;
  if (!vacio(req.query.estado_despacho)) where.estado_despacho = req.query.estado_despacho;
  if (!vacio(req.query.sucursal_id) && req.sucursalFiltro === null) {
    where.sucursal_id = Number(req.query.sucursal_id);
  }
  if (!vacio(req.query.fecha_inicio) && !vacio(req.query.fecha_fin)) {
    where.fecha = { [Op.between]: [req.query.fecha_inicio, req.query.fecha_fin] };
  }

  const ventas = await Venta.findAll({
    where,
    include: incluirTodo,
    order: [
      ['fecha', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: 300,
  });

  const data = ventas.map((v) => ventasService.segunUsuario(v, req.usuario));

  // Los totales solo tienen sentido para quien ve los precios.
  let totales = null;
  if (req.usuario.rol !== 'sucursal') {
    const porMoneda = new Map();
    ventas
      .filter((v) => v.estado === 'registrada')
      .forEach((v) => {
        const clave = `${v.origen}|${v.moneda}`;
        const acumulado = porMoneda.get(clave) || { origen: v.origen, moneda: v.moneda, ventas: 0, total: 0 };
        acumulado.ventas += 1;
        acumulado.total = Number((acumulado.total + Number(v.total)).toFixed(2));
        porMoneda.set(clave, acumulado);
      });
    totales = [...porMoneda.values()];
  }

  res.json({ success: true, data, totales });
});

const obtener = asyncHandler(async (req, res) => {
  const venta = await Venta.findByPk(req.params.id, { include: incluirTodo });
  if (!venta) return res.status(404).json({ success: false, message: 'Venta no encontrada.' });

  if (req.sucursalFiltro !== null && Number(venta.sucursal_id) !== req.sucursalFiltro) {
    return res.status(403).json({ success: false, message: 'Esa venta no es de su sucursal.' });
  }

  res.json({ success: true, data: ventasService.segunUsuario(venta, req.usuario) });
});

// ============================================================
//  VENTA DESDE LA PLANTA  (administrador)
// ============================================================
const crearVenta = conErroresDeNegocio(async (req, res) => {
  const venta = await ventasService.registrarVentaPlanta(req.body, req.usuario);
  const completa = await Venta.findByPk(venta.id, { include: incluirTodo });

  res.status(201).json({
    success: true,
    message: venta.sucursal_id
      ? 'Venta registrada. Queda pendiente que la sucursal confirme lo que recibió.'
      : 'Venta registrada.',
    data: ventasService.paraAdmin(completa),
  });
});

// Productos disponibles para vender, con su existencia en cuarto frío.
const disponibles = asyncHandler(async (req, res) => {
  const mapa = await cuartoFrioService.existenciaPorProducto();
  const productos = [...mapa.values()]
    .filter((p) => p.kilos > 0.0005)
    .sort((a, b) => a.producto.localeCompare(b.producto, 'es'));
  res.json({ success: true, data: productos });
});

// ============================================================
//  DESPACHOS PENDIENTES  (la campana de la sucursal)
// ============================================================

// @desc  Despachos que esperan confirmación.
// @route GET /api/ventas/despachos/pendientes
const despachosPendientes = asyncHandler(async (req, res) => {
  const where = { estado: 'registrada', estado_despacho: { [Op.in]: ['pendiente', 'diferencia'] } };
  if (req.sucursalFiltro !== null) {
    where.sucursal_id = req.sucursalFiltro;
    // La sucursal solo actúa sobre los que aún no ha contado; los que
    // están en diferencia los resuelve el administrador.
    where.estado_despacho = 'pendiente';
  } else {
    where.sucursal_id = { [Op.ne]: null };
  }

  const ventas = await Venta.findAll({
    where,
    include: incluirTodo,
    order: [['fecha', 'ASC']],
  });

  res.json({
    success: true,
    data: ventas.map((v) => ventasService.segunUsuario(v, req.usuario)),
    pendientes: ventas.length,
  });
});

/**
 * La sucursal anota lo que contó, sin haber visto lo enviado.
 * @route POST /api/ventas/:id/recepcion
 */
const confirmarRecepcion = conErroresDeNegocio(async (req, res) => {
  const venta = await ventasService.confirmarRecepcion(req.params.id, req.body.conteos, req.usuario);
  const completa = await Venta.findByPk(venta.id, { include: incluirTodo });

  const cuadro = completa.estado_despacho === 'cerrado';
  res.json({
    success: true,
    message: cuadro
      ? 'Recepción confirmada. El producto ya está en su inventario.'
      : 'Recepción registrada. Lo que contó no coincide con lo despachado; el administrador va a revisarlo.',
    // Se le responde con su misma vista recortada.
    data: ventasService.segunUsuario(completa, req.usuario),
  });
});

/**
 * El administrador decide qué hacer con una diferencia.
 * @route PATCH /api/ventas/:id/resolver
 */
const resolverDiferencia = conErroresDeNegocio(async (req, res) => {
  const venta = await ventasService.resolverDiferencia(req.params.id, req.body.resolucion, req.body.nota);
  const completa = await Venta.findByPk(venta.id, { include: incluirTodo });
  res.json({ success: true, message: 'Diferencia resuelta.', data: ventasService.paraAdmin(completa) });
});

const anular = conErroresDeNegocio(async (req, res) => {
  await ventasService.anularVenta(req.params.id, req.body?.motivo);
  res.json({ success: true, message: 'Venta anulada y existencias devueltas.' });
});

// ============================================================
//  LA SUCURSAL: SU INVENTARIO Y SUS VENTAS
// ============================================================

// @route GET /api/ventas/sucursal/inventario
const inventarioSucursal = asyncHandler(async (req, res) => {
  const sucursalId = req.sucursalFiltro !== null ? req.sucursalFiltro : Number(req.query.sucursal_id);
  if (!sucursalId) return res.status(400).json({ success: false, message: 'Indique la sucursal.' });

  const productos = await ventasService.existenciaSucursal(sucursalId);

  res.json({
    success: true,
    data: {
      productos,
      totales: {
        productos: productos.length,
        kilos: Number(productos.reduce((s, p) => s + p.kilos, 0).toFixed(3)),
      },
    },
  });
});

// @route POST /api/ventas/sucursal
const venderDesdeSucursal = conErroresDeNegocio(async (req, res) => {
  const venta = await ventasService.registrarVentaSucursal(req.body, req.usuario);
  const completa = await Venta.findByPk(venta.id, { include: incluirTodo });
  res.status(201).json({
    success: true,
    message: 'Venta registrada.',
    data: ventasService.segunUsuario(completa, req.usuario),
  });
});

// @route GET /api/ventas/sucursal/movimientos
const movimientosSucursal = asyncHandler(async (req, res) => {
  const sucursalId = req.sucursalFiltro !== null ? req.sucursalFiltro : Number(req.query.sucursal_id);
  if (!sucursalId) return res.status(400).json({ success: false, message: 'Indique la sucursal.' });

  const movimientos = await MovimientoSucursal.findAll({
    where: { sucursal_id: sucursalId },
    order: [
      ['fecha', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: 300,
  });

  res.json({ success: true, data: movimientos });
});

// ============================================================
//  Reglas
// ============================================================
const reglasVenta = [
  body('items').isArray({ min: 1 }).withMessage('Agregue al menos un producto'),
  body('fecha').optional({ nullable: true }).isISO8601().withMessage('Fecha inválida'),
  body('moneda').optional({ nullable: true }).customSanitizer((v) => (v ? String(v).toUpperCase() : v)).isIn(MONEDAS),
  body('sucursal_id').optional({ nullable: true }).isInt().withMessage('Sucursal inválida'),
];

const reglasRecepcion = [body('conteos').isArray({ min: 1 }).withMessage('Anote lo que recibió')];

router.use(proteger);
// Todas las consultas pasan por aquí: es lo que ata a un usuario de
// sucursal a sus propios datos.
router.use(alcanceSucursal);

// ---- Sucursal ----
router.get('/sucursal/inventario', inventarioSucursal);
router.get('/sucursal/movimientos', movimientosSucursal);
router.post('/sucursal', soloSucursal, reglasVenta, validar, venderDesdeSucursal);

// ---- Despachos ----
router.get('/despachos/pendientes', despachosPendientes);
router.post('/:id/recepcion', [param('id').isInt(), ...reglasRecepcion], validar, confirmarRecepcion);
router.patch('/:id/resolver', permitirRoles('admin', 'contabilidad'), [param('id').isInt()], validar, resolverDiferencia);

// ---- Planta ----
router.get('/disponibles', permitirRoles('admin', 'contabilidad', 'operador'), disponibles);
router.get('/', listar);
router.get('/:id', [param('id').isInt()], validar, obtener);
router.post('/', permitirRoles('admin', 'contabilidad', 'operador'), reglasVenta, validar, crearVenta);
router.delete('/:id', permitirRoles('admin'), [param('id').isInt()], validar, anular);

module.exports = router;
