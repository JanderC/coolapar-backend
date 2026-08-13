const express = require('express');
const { body, param, query } = require('express-validator');
const { Op } = require('sequelize');

const { Empleado, PagoNomina, MovimientoCaja } = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');
const nominaService = require('../../services/nomina.service');
const cajaService = require('../../services/caja.service');
const prestamosService = require('../../services/prestamos.service');

const router = express.Router();

const vacio = (v) => v === undefined || v === null || v === '';
const MONEDAS = ['BS', 'USD', 'COP'];
const FRECUENCIAS = ['semanal', 'quincenal', 'mensual'];

// Los errores de negocio son del usuario (falta plata, ya estaba pagado),
// no fallos del programa: van con 400 y su mensaje, no con un 500 mudo.
const conErroresDeNegocio = (manejador) =>
  asyncHandler(async (req, res, next) => {
    try {
      await manejador(req, res, next);
    } catch (err) {
      if (err.esErrorDeNegocio) return res.status(400).json({ success: false, message: err.message });
      throw err;
    }
  });

// ============================================================
//  El modulo tiene TRES SECTORES que se manejan por separado:
//
//   1. EMPLEADOS Y NOMINA  -> sueldos, recibos y adelantos.
//      Un ADELANTO se descuenta del proximo sueldo.
//
//   2. COMPRAS             -> lo que se le paga a proveedores.
//      Las compras de insumos NO se cargan aqui: se leen del
//      inventario, donde ya quedaron registradas con su precio.
//
//   3. PRESTAMOS           -> plata que se le presta a un empleado,
//      a un productor o a un rutero. NO se descuenta de ningun
//      sueldo ni de ninguna semana: la persona la va cancelando en
//      abonos, y cada abono entra como ingreso.
//
//  El libro de caja los junta a todos para ver el movimiento real.
// ============================================================

// ============================================================
//  SECTOR 1 — EMPLEADOS
// ============================================================
const listarEmpleados = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.activo !== undefined) where.activo = req.query.activo === 'true';
  if (!vacio(req.query.buscar)) where.nombre = { [Op.iLike]: `%${String(req.query.buscar).trim()}%` };

  const empleados = await Empleado.findAll({ where, order: [['nombre', 'ASC']] });

  // Cuanto se le debe descontar a cada uno en su proximo recibo.
  const pendientes = await MovimientoCaja.findAll({
    where: { categoria: 'adelanto', anulado: false, descontado_en_id: null },
    attributes: ['empleado_id', 'monto', 'moneda'],
  });

  const porEmpleado = new Map();
  pendientes.forEach((a) => {
    if (!a.empleado_id) return;
    const actual = porEmpleado.get(a.empleado_id) || {};
    actual[a.moneda] = Number(((actual[a.moneda] || 0) + Number(a.monto)).toFixed(2));
    porEmpleado.set(a.empleado_id, actual);
  });

  res.json({
    success: true,
    data: empleados.map((e) => ({
      ...e.toJSON(),
      adelantos_pendientes: porEmpleado.get(e.id) || {},
    })),
  });
});

const crearEmpleado = asyncHandler(async (req, res) => {
  const datos = normalizarEmpleado(req.body);
  if (!datos.nombre) return res.status(400).json({ success: false, message: 'El nombre es obligatorio.' });

  const empleado = await Empleado.create(datos);
  res.status(201).json({ success: true, data: empleado });
});

const actualizarEmpleado = asyncHandler(async (req, res) => {
  const empleado = await Empleado.findByPk(req.params.id);
  if (!empleado) return res.status(404).json({ success: false, message: 'Empleado no encontrado.' });

  await empleado.update(normalizarEmpleado(req.body));
  res.json({ success: true, data: empleado });
});

const archivarEmpleado = asyncHandler(async (req, res) => {
  const empleado = await Empleado.findByPk(req.params.id);
  if (!empleado) return res.status(404).json({ success: false, message: 'Empleado no encontrado.' });

  // Un empleado con adelantos sin descontar no se archiva: esa plata
  // quedaria colgando sin recibo donde aparecer.
  const pendientes = await MovimientoCaja.count({
    where: { empleado_id: empleado.id, categoria: 'adelanto', anulado: false, descontado_en_id: null },
  });
  if (pendientes > 0) {
    return res.status(400).json({
      success: false,
      message: `${empleado.nombre} tiene ${pendientes} adelanto(s) sin descontar. Hágale el recibo antes de archivarlo.`,
    });
  }

  await empleado.update({ activo: false });
  res.json({ success: true, message: 'Empleado archivado.' });
});

function normalizarEmpleado(body = {}) {
  const datos = {};
  if (body.nombre !== undefined) datos.nombre = String(body.nombre).trim();
  if (body.cedula !== undefined) datos.cedula = vacio(body.cedula) ? null : String(body.cedula).trim();
  if (body.cargo !== undefined) datos.cargo = vacio(body.cargo) ? null : String(body.cargo).trim();
  if (body.sueldo !== undefined) datos.sueldo = vacio(body.sueldo) ? null : Number(body.sueldo);
  if (body.moneda !== undefined) datos.moneda = String(body.moneda || 'BS').toUpperCase();
  if (body.frecuencia_pago !== undefined) datos.frecuencia_pago = String(body.frecuencia_pago || 'semanal');
  if (body.telefono !== undefined) datos.telefono = vacio(body.telefono) ? null : String(body.telefono).trim();
  if (body.fecha_ingreso !== undefined) datos.fecha_ingreso = vacio(body.fecha_ingreso) ? null : body.fecha_ingreso;
  if (body.notas !== undefined) datos.notas = vacio(body.notas) ? null : String(body.notas).trim();
  if (body.activo !== undefined) datos.activo = body.activo === true || body.activo === 'true';
  return datos;
}

// ============================================================
//  SECTOR 1 — RECIBOS DE NOMINA
// ============================================================
const listarRecibos = asyncHandler(async (req, res) => {
  const where = {};
  if (!vacio(req.query.empleado_id)) where.empleado_id = Number(req.query.empleado_id);
  if (!vacio(req.query.estado)) where.estado = req.query.estado;
  if (!vacio(req.query.fecha_inicio) && !vacio(req.query.fecha_fin)) {
    where.fecha = { [Op.between]: [req.query.fecha_inicio, req.query.fecha_fin] };
  }

  const recibos = await PagoNomina.findAll({
    where,
    include: [{ model: Empleado, as: 'Empleado', required: false, attributes: ['id', 'nombre', 'cargo'] }],
    order: [
      ['fecha', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: 300,
  });

  res.json({ success: true, data: recibos });
});

const previsualizarRecibo = conErroresDeNegocio(async (req, res) => {
  const datos = await nominaService.previsualizar(req.params.empleadoId, {
    periodo_fin: req.query.periodo_fin || null,
  });
  res.json({ success: true, data: datos });
});

const crearRecibo = conErroresDeNegocio(async (req, res) => {
  const recibo = await nominaService.crearRecibo(req.body);
  res.status(201).json({
    success: true,
    message: recibo.estado === 'pagado' ? 'Recibo pagado y anotado en caja.' : 'Recibo guardado como borrador.',
    data: recibo,
  });
});

const pagarRecibo = conErroresDeNegocio(async (req, res) => {
  const recibo = await nominaService.marcarPagado(req.params.id, req.body);
  res.json({ success: true, message: 'Recibo marcado como pagado.', data: recibo });
});

const anularRecibo = conErroresDeNegocio(async (req, res) => {
  await nominaService.anularRecibo(req.params.id, req.body?.motivo);
  res.json({ success: true, message: 'Recibo anulado. Los adelantos vuelven a quedar pendientes.' });
});

// ============================================================
//  SECTOR 1 — ADELANTOS (se descuentan del sueldo)
// ============================================================
const listarAdelantos = asyncHandler(async (req, res) => {
  const where = { categoria: 'adelanto' };
  if (!vacio(req.query.empleado_id)) where.empleado_id = Number(req.query.empleado_id);
  if (req.query.pendientes === 'true') {
    where.descontado_en_id = null;
    where.anulado = false;
  }

  const adelantos = await MovimientoCaja.findAll({
    where,
    include: [{ model: Empleado, as: 'Empleado', required: false, attributes: ['id', 'nombre'] }],
    order: [
      ['fecha', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: 300,
  });

  res.json({ success: true, data: adelantos });
});

const crearAdelanto = conErroresDeNegocio(async (req, res) => {
  const adelanto = await nominaService.registrarAdelanto(req.body);
  res.status(201).json({
    success: true,
    message: 'Adelanto registrado. Se descontará en el próximo recibo.',
    data: adelanto,
  });
});

// ============================================================
//  SECTOR 2 — COMPRAS
// ============================================================
const listarCompras = asyncHandler(async (req, res) => {
  // Se piden al libro solo las categorias de compra. Las de inventario
  // vienen derivadas y salen marcadas como no editables.
  const libro = await cajaService.libro({
    fecha_inicio: req.query.fecha_inicio,
    fecha_fin: req.query.fecha_fin,
    moneda: req.query.moneda,
  });

  const CATEGORIAS_COMPRA = ['compra', 'compra_insumo', 'compra_inventario', 'servicio'];
  const compras = libro.movimientos.filter((m) => CATEGORIAS_COMPRA.includes(m.categoria));

  const porMoneda = new Map();
  compras
    .filter((c) => !c.anulado)
    .forEach((c) => {
      porMoneda.set(c.moneda, Number(((porMoneda.get(c.moneda) || 0) + c.monto).toFixed(2)));
    });

  res.json({
    success: true,
    data: {
      rango: libro.rango,
      compras,
      totales_por_moneda: [...porMoneda.entries()]
        .map(([moneda, total]) => ({ moneda, total }))
        .sort((a, b) => a.moneda.localeCompare(b.moneda)),
    },
  });
});

const crearCompra = conErroresDeNegocio(async (req, res) => {
  const movimiento = await cajaService.registrarMovimiento({
    ...req.body,
    tipo: 'egreso',
    categoria: req.body.categoria || 'compra',
  });
  res.status(201).json({ success: true, message: 'Compra registrada.', data: movimiento });
});

// ============================================================
//  SECTOR 3 — PRESTAMOS (no se descuentan del sueldo)
// ============================================================
const listarPrestamos = asyncHandler(async (req, res) => {
  const prestamos = await prestamosService.listar(req.query);
  res.json({ success: true, data: prestamos });
});

const obtenerPrestamo = conErroresDeNegocio(async (req, res) => {
  const prestamo = await prestamosService.obtener(req.params.id);
  res.json({ success: true, data: prestamo });
});

const crearPrestamo = conErroresDeNegocio(async (req, res) => {
  const prestamo = await prestamosService.crear(req.body);
  res.status(201).json({
    success: true,
    message: 'Préstamo entregado. Se cobra por abonos, no se descuenta del sueldo.',
    data: prestamo,
  });
});

const abonarPrestamo = conErroresDeNegocio(async (req, res) => {
  const { saldo } = await prestamosService.registrarAbono(req.params.id, req.body);
  res.status(201).json({
    success: true,
    message: saldo <= 0.004 ? 'Abono registrado. El préstamo quedó cancelado.' : `Abono registrado. Quedan ${saldo}.`,
    data: { saldo },
  });
});

const anularPrestamo = conErroresDeNegocio(async (req, res) => {
  await prestamosService.anular(req.params.id, req.body?.motivo);
  res.json({ success: true, message: 'Préstamo anulado.' });
});

const saldosPrestamos = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await prestamosService.saldosPorBeneficiario() });
});

// ============================================================
//  LIBRO DE CAJA (junta los tres sectores)
// ============================================================
const verLibro = asyncHandler(async (req, res) => {
  const datos = await cajaService.libro({
    fecha_inicio: req.query.fecha_inicio,
    fecha_fin: req.query.fecha_fin,
    categoria: req.query.categoria,
    moneda: req.query.moneda,
    incluir_derivados: req.query.incluir_derivados !== 'false',
  });
  res.json({ success: true, data: datos });
});

const crearMovimientoCaja = conErroresDeNegocio(async (req, res) => {
  const movimiento = await cajaService.registrarMovimiento(req.body);
  res.status(201).json({ success: true, message: 'Movimiento registrado.', data: movimiento });
});

const anularMovimientoCaja = conErroresDeNegocio(async (req, res) => {
  await cajaService.anularMovimiento(req.params.id, req.body?.motivo);
  res.json({ success: true, message: 'Movimiento anulado.' });
});

// ============================================================
//  Reglas
// ============================================================
const reglasEmpleado = (esCreacion) => [
  esCreacion
    ? body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio')
    : body('nombre').optional().trim().notEmpty().withMessage('El nombre no puede quedar vacío'),
  body('sueldo')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0))
    .withMessage('El sueldo debe ser un número mayor o igual a 0'),
  body('moneda').optional({ nullable: true }).customSanitizer((v) => (v ? String(v).toUpperCase() : v)).isIn(MONEDAS),
  body('frecuencia_pago').optional({ nullable: true }).isIn(FRECUENCIAS).withMessage('Frecuencia inválida'),
  body('fecha_ingreso').optional({ nullable: true }).isISO8601().withMessage('Fecha inválida'),
];

const reglasRecibo = [
  body('empleado_id').isInt().withMessage('Elija el empleado'),
  body('periodo_inicio').isISO8601().withMessage('Indique desde cuándo va el período'),
  body('periodo_fin').isISO8601().withMessage('Indique hasta cuándo va el período'),
  body('fecha').optional({ nullable: true }).isISO8601().withMessage('Fecha inválida'),
  body('moneda').optional({ nullable: true }).customSanitizer((v) => (v ? String(v).toUpperCase() : v)).isIn(MONEDAS),
  body('estado').optional({ nullable: true }).isIn(['borrador', 'pagado']).withMessage('Estado inválido'),
];

const reglasAdelanto = [
  body('empleado_id').isInt().withMessage('Elija el empleado'),
  body('monto').custom((v) => !Number.isNaN(Number(v)) && Number(v) > 0).withMessage('El monto debe ser mayor a 0'),
  body('fecha').optional({ nullable: true }).isISO8601().withMessage('Fecha inválida'),
  body('moneda').optional({ nullable: true }).customSanitizer((v) => (v ? String(v).toUpperCase() : v)).isIn(MONEDAS),
];

const reglasPrestamo = [
  body('beneficiario_tipo').isIn(['empleado', 'productor', 'rutero', 'otro']).withMessage('Indique a quién se le presta'),
  body('monto').custom((v) => !Number.isNaN(Number(v)) && Number(v) > 0).withMessage('El monto debe ser mayor a 0'),
  body('fecha').optional({ nullable: true }).isISO8601().withMessage('Fecha inválida'),
  body('moneda').optional({ nullable: true }).customSanitizer((v) => (v ? String(v).toUpperCase() : v)).isIn(MONEDAS),
  body('motivo').optional({ nullable: true }).isLength({ max: 255 }).withMessage('Motivo demasiado largo'),
];

const reglasAbono = [
  body('monto').custom((v) => !Number.isNaN(Number(v)) && Number(v) > 0).withMessage('El monto debe ser mayor a 0'),
  body('fecha').optional({ nullable: true }).isISO8601().withMessage('Fecha inválida'),
];

const reglasMovimiento = [
  body('tipo').isIn(['ingreso', 'egreso']).withMessage('El tipo debe ser ingreso o egreso'),
  body('categoria').trim().notEmpty().withMessage('Elija la categoría'),
  body('concepto').trim().notEmpty().withMessage('Escriba de qué se trata'),
  body('monto').custom((v) => !Number.isNaN(Number(v)) && Number(v) > 0).withMessage('El monto debe ser mayor a 0'),
  body('fecha').optional({ nullable: true }).isISO8601().withMessage('Fecha inválida'),
  body('moneda').optional({ nullable: true }).customSanitizer((v) => (v ? String(v).toUpperCase() : v)).isIn(MONEDAS),
];

router.use(proteger);

// Empleados
router.get('/empleados', listarEmpleados);
router.post('/empleados', permitirRoles('admin', 'contabilidad'), reglasEmpleado(true), validar, crearEmpleado);
router.put(
  '/empleados/:id',
  permitirRoles('admin', 'contabilidad'),
  [param('id').isInt(), ...reglasEmpleado(false)],
  validar,
  actualizarEmpleado
);
router.delete('/empleados/:id', permitirRoles('admin'), [param('id').isInt()], validar, archivarEmpleado);

// Recibos
router.get('/recibos', listarRecibos);
router.get('/recibos/previsualizar/:empleadoId', [param('empleadoId').isInt()], validar, previsualizarRecibo);
router.post('/recibos', permitirRoles('admin', 'contabilidad'), reglasRecibo, validar, crearRecibo);
router.patch('/recibos/:id/pagar', permitirRoles('admin', 'contabilidad'), [param('id').isInt()], validar, pagarRecibo);
router.delete('/recibos/:id', permitirRoles('admin', 'contabilidad'), [param('id').isInt()], validar, anularRecibo);

// Adelantos
router.get('/adelantos', listarAdelantos);
router.post('/adelantos', permitirRoles('admin', 'contabilidad'), reglasAdelanto, validar, crearAdelanto);

// Sector 2 — Compras
router.get('/compras', listarCompras);
router.post('/compras', permitirRoles('admin', 'contabilidad'), reglasMovimiento, validar, crearCompra);

// Sector 3 — Préstamos
router.get('/prestamos', listarPrestamos);
router.get('/prestamos/saldos', saldosPrestamos);
router.get('/prestamos/:id', [param('id').isInt()], validar, obtenerPrestamo);
router.post('/prestamos', permitirRoles('admin', 'contabilidad'), reglasPrestamo, validar, crearPrestamo);
router.post(
  '/prestamos/:id/abonos',
  permitirRoles('admin', 'contabilidad'),
  [param('id').isInt(), ...reglasAbono],
  validar,
  abonarPrestamo
);
router.delete('/prestamos/:id', permitirRoles('admin'), [param('id').isInt()], validar, anularPrestamo);

// Libro de caja
router.get(
  '/caja',
  [query('fecha_inicio').optional().isISO8601(), query('fecha_fin').optional().isISO8601()],
  validar,
  verLibro
);
router.post('/caja', permitirRoles('admin', 'contabilidad'), reglasMovimiento, validar, crearMovimientoCaja);
router.delete('/caja/:id', permitirRoles('admin', 'contabilidad'), [param('id').isInt()], validar, anularMovimientoCaja);

module.exports = router;