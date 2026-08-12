const express = require('express');
const { body, param, query } = require('express-validator');
const { Op } = require('sequelize');

const db = require('../../models');
const { Insumo, MovimientoInsumo, RegistroLecheProductor, LoteProduccion } = db;
const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');
const insumosService = require('../../services/insumos.service');

const router = express.Router();

const MONEDAS = ['BS', 'USD', 'COP'];
const TIPOS_MOVIMIENTO = ['entrada', 'salida'];

const vacio = (v) => v === undefined || v === null || v === '';

// ---------- Unidades de medida ----------
// Se cierran a una lista fija para que el inventario sea sumable y
// entendible. Sin esto la gente escribe "Kg", "kilos", "KILOS" y el mismo
// insumo termina con tres unidades distintas que no se pueden comparar.
const UNIDADES = ['kg', 'g', 'L', 'ml', 'unidades', 'sacos', 'cajas', 'bolsas', 'rollos', 'pares', 'm', 'cm'];

// Formas de escribir cada unidad que se aceptan y se corrigen solas.
const SINONIMOS_UNIDAD = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
  l: 'L', lt: 'L', lts: 'L', litro: 'L', litros: 'L',
  ml: 'ml', mililitro: 'ml', mililitros: 'ml',
  u: 'unidades', und: 'unidades', unid: 'unidades', unidad: 'unidades', unidades: 'unidades', pieza: 'unidades', piezas: 'unidades',
  saco: 'sacos', sacos: 'sacos',
  caja: 'cajas', cajas: 'cajas',
  bolsa: 'bolsas', bolsas: 'bolsas',
  rollo: 'rollos', rollos: 'rollos',
  par: 'pares', pares: 'pares',
  m: 'm', metro: 'm', metros: 'm',
  cm: 'cm', centimetro: 'cm', centimetros: 'cm',
};

/** Deja la unidad en su forma canonica; devuelve null si no la reconoce. */
const normalizarUnidad = (valor) => {
  const limpio = String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!limpio) return null;
  return SINONIMOS_UNIDAD[limpio] || null;
};

// Unidad fija de la leche: siempre litros.
const UNIDAD_LECHE = 'L';

/** Suma una columna, devolviendo 0 en vez de null cuando no hay filas. */
const sumar = async (modelo, columna, where) => {
  const total = await modelo.sum(columna, { where });
  return Number(total || 0);
};

const redondear2 = (n) => Number(Number(n || 0).toFixed(2));

const normalizarCampos = (body = {}) => {
  const datos = {};
  if (body.nombre !== undefined) datos.nombre = String(body.nombre).trim();
  if (body.unidad_medida !== undefined) {
    // Se guarda ya normalizada ("Kilos" -> "kg"). Si no se reconoce se deja
    // el texto tal cual para que validarDatos lo rechace con un mensaje claro.
    datos.unidad_medida = normalizarUnidad(body.unidad_medida) || String(body.unidad_medida).trim();
  }
  if (body.precio_unitario_referencia !== undefined) {
    datos.precio_unitario_referencia = vacio(body.precio_unitario_referencia) ? null : Number(body.precio_unitario_referencia);
  }
  if (body.moneda_referencia !== undefined) {
    datos.moneda_referencia = vacio(body.moneda_referencia) ? null : String(body.moneda_referencia).toUpperCase();
  }
  if (body.stock_minimo !== undefined) {
    datos.stock_minimo = vacio(body.stock_minimo) ? null : Number(body.stock_minimo);
  }
  if (body.proveedor !== undefined) datos.proveedor = vacio(body.proveedor) ? null : String(body.proveedor).trim();
  if (body.activo !== undefined) datos.activo = body.activo === true || body.activo === 'true';
  // stock_actual NUNCA se acepta aquí: solo lo mueve insumos.service.js a través de movimientos.
  return datos;
};

const validarDatos = (datos, { esCreacion }) => {
  if (esCreacion && !datos.nombre) return 'El nombre del insumo es obligatorio.';
  if (datos.nombre !== undefined && !datos.nombre) return 'El nombre del insumo es obligatorio.';
  if (esCreacion && !datos.unidad_medida) return 'La unidad de medida es obligatoria.';
  if (datos.unidad_medida !== undefined && !datos.unidad_medida) return 'La unidad de medida es obligatoria.';

  if (datos.unidad_medida !== undefined && datos.unidad_medida && !UNIDADES.includes(datos.unidad_medida)) {
    return `Unidad de medida no reconocida. Use una de: ${UNIDADES.join(', ')}.`;
  }

  if (datos.moneda_referencia && !MONEDAS.includes(datos.moneda_referencia)) {
    return `Moneda inválida. Use una de: ${MONEDAS.join(', ')}.`;
  }
  if (datos.precio_unitario_referencia !== undefined && datos.precio_unitario_referencia !== null) {
    if (Number.isNaN(datos.precio_unitario_referencia) || datos.precio_unitario_referencia < 0) {
      return 'El precio de referencia debe ser un número mayor o igual a 0.';
    }
  }
  if (datos.stock_minimo !== undefined && datos.stock_minimo !== null) {
    if (Number.isNaN(datos.stock_minimo) || datos.stock_minimo < 0) {
      return 'El stock mínimo debe ser un número mayor o igual a 0.';
    }
  }
  return null;
};

// ---------- Catálogo ----------
const listar = asyncHandler(async (req, res) => {
  const { activo, buscar, bajo_stock } = req.query;
  const where = {};
  if (activo !== undefined) where.activo = activo === 'true';
  if (!vacio(buscar)) where.nombre = { [Op.iLike]: `%${String(buscar).trim()}%` };

  let insumos = await Insumo.findAll({ where, order: [['nombre', 'ASC']] });
  if (bajo_stock === 'true') insumos = insumos.filter((i) => insumosService.alertaStockMinimo(i));

  res.json({ success: true, data: insumos });
});

// ---------- Inventario completo ----------
// Devuelve, en una sola llamada, todo lo que necesita la pantalla:
//   - la leche que entro por el registro diario de los productores
//   - el catalogo de productos con su stock
//
// La LECHE no se carga a mano en insumos ni se guarda en la tabla
// `insumos`: se calcula al vuelo sumando registros_leche_productores. Asi
// nunca queda descuadrada con lo que cargo el operador, y no hay que
// acordarse de registrarla dos veces.
const resumenInventario = asyncHandler(async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query;
  const hayRango = !vacio(fecha_inicio) && !vacio(fecha_fin);
  const enRango = hayRango ? { fecha: { [Op.between]: [fecha_inicio, fecha_fin] } } : null;

  // --- Leche recibida de los productores ---
  const columnas = [
    { clave: 'buenos', columna: 'litros', nombre: 'Leche — litros buenos' },
    { clave: 'acidos', columna: 'litros_acidos', nombre: 'Leche — litros acidos' },
    { clave: 'bajo_grasa', columna: 'litros_bajo_grasa', nombre: 'Leche — litros bajos en grasa' },
  ];

  const tipos = await Promise.all(
    columnas.map(async (c) => ({
      clave: c.clave,
      nombre: c.nombre,
      unidad_medida: UNIDAD_LECHE,
      recibido_rango: hayRango ? redondear2(await sumar(RegistroLecheProductor, c.columna, enRango)) : null,
      recibido_total: redondear2(await sumar(RegistroLecheProductor, c.columna, null)),
    }))
  );

  // Ultimo dia con leche cargada: sirve para que la pantalla avise si el
  // registro diario lleva rato sin moverse.
  const ultimo = await RegistroLecheProductor.findOne({
    order: [['fecha', 'DESC']],
    attributes: ['fecha'],
  });

  // --- Leche que ya se uso en produccion ---
  // OJO: los lotes de produccion guardan litros_utilizados sin separar si
  // eran buenos, acidos o bajos en grasa. Por eso lo consumido solo se
  // puede descontar del total, no de cada tipo por separado.
  const usadaTotal = LoteProduccion
    ? redondear2(await sumar(LoteProduccion, 'litros_utilizados', { activo: true }))
    : 0;
  const usadaRango = LoteProduccion && hayRango
    ? redondear2(await sumar(LoteProduccion, 'litros_utilizados', { activo: true, ...enRango }))
    : null;

  const recibidoTotal = redondear2(tipos.reduce((s, t) => s + t.recibido_total, 0));
  const recibidoRango = hayRango ? redondear2(tipos.reduce((s, t) => s + (t.recibido_rango || 0), 0)) : null;

  // --- Catalogo de productos ---
  const insumos = await Insumo.findAll({ order: [['nombre', 'ASC']] });
  const enAlerta = insumos.filter((i) => i.activo && insumosService.alertaStockMinimo(i));

  res.json({
    success: true,
    data: {
      leche: {
        unidad_medida: UNIDAD_LECHE,
        rango: hayRango ? { fecha_inicio, fecha_fin } : null,
        tipos,
        recibido_rango: recibidoRango,
        recibido_total: recibidoTotal,
        usada_produccion_rango: usadaRango,
        usada_produccion_total: usadaTotal,
        disponible_total: redondear2(recibidoTotal - usadaTotal),
        ultima_carga: ultimo ? ultimo.fecha : null,
      },
      insumos,
      unidades: UNIDADES,
      alertas: enAlerta.map((i) => ({ id: i.id, nombre: i.nombre, stock_actual: i.stock_actual, stock_minimo: i.stock_minimo, unidad_medida: i.unidad_medida })),
    },
  });
});

const alertasStock = asyncHandler(async (req, res) => {
  const insumos = await Insumo.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });
  const enAlerta = insumos.filter((i) => insumosService.alertaStockMinimo(i));
  res.json({ success: true, data: enAlerta });
});

const obtener = asyncHandler(async (req, res) => {
  const insumo = await Insumo.findByPk(req.params.id);
  if (!insumo) return res.status(404).json({ success: false, message: 'Insumo no encontrado.' });
  res.json({ success: true, data: insumo });
});

const crear = asyncHandler(async (req, res) => {
  const datos = normalizarCampos(req.body);

  const error = validarDatos(datos, { esCreacion: true });
  if (error) return res.status(400).json({ success: false, message: error });

  const insumo = await Insumo.create({ ...datos, stock_actual: 0 });
  res.status(201).json({ success: true, data: insumo });
});

const actualizar = asyncHandler(async (req, res) => {
  const insumo = await Insumo.findByPk(req.params.id);
  if (!insumo) return res.status(404).json({ success: false, message: 'Insumo no encontrado.' });

  const datos = normalizarCampos(req.body);
  const error = validarDatos(datos, { esCreacion: false });
  if (error) return res.status(400).json({ success: false, message: error });

  await insumo.update(datos);
  res.json({ success: true, data: insumo });
});

const eliminar = asyncHandler(async (req, res) => {
  const insumo = await Insumo.findByPk(req.params.id);
  if (!insumo) return res.status(404).json({ success: false, message: 'Insumo no encontrado.' });

  await insumo.update({ activo: false });
  res.json({ success: true, message: 'Insumo desactivado.' });
});

// ---------- Kardex ----------
const listarMovimientos = asyncHandler(async (req, res) => {
  const insumo = await Insumo.findByPk(req.params.id);
  if (!insumo) return res.status(404).json({ success: false, message: 'Insumo no encontrado.' });

  const where = { insumo_id: insumo.id };
  if (req.query.tipo && TIPOS_MOVIMIENTO.includes(req.query.tipo)) where.tipo = req.query.tipo;

  const movimientos = await MovimientoInsumo.findAll({
    where,
    order: [['fecha', 'DESC'], ['id', 'DESC']],
  });
  res.json({ success: true, data: movimientos });
});

const crearMovimiento = asyncHandler(async (req, res) => {
  try {
    const { movimiento, insumo, alertaStockMinimo } = await insumosService.registrarMovimiento(req.params.id, req.body);
    res.status(201).json({
      success: true,
      data: { movimiento, stock_actual: insumo.stock_actual, alerta_stock_minimo: alertaStockMinimo },
    });
  } catch (err) {
    if (err.esErrorDeNegocio) return res.status(400).json({ success: false, message: err.message });
    throw err;
  }
});

const anularMovimiento = asyncHandler(async (req, res) => {
  try {
    const { insumo } = await insumosService.anularMovimiento(req.params.movimientoId);
    res.json({ success: true, message: 'Movimiento anulado.', data: { stock_actual: insumo.stock_actual } });
  } catch (err) {
    if (err.esErrorDeNegocio) return res.status(400).json({ success: false, message: err.message });
    throw err;
  }
});

// ---------- Reglas de validación ----------
const reglasInsumo = (esCreacion) => [
  esCreacion
    ? body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio')
    : body('nombre').optional().trim().notEmpty().withMessage('El nombre no puede quedar vacío'),
  esCreacion
    ? body('unidad_medida').trim().notEmpty().withMessage('La unidad de medida es obligatoria')
    : body('unidad_medida').optional().trim().notEmpty().withMessage('La unidad de medida no puede quedar vacía'),
  body('moneda_referencia')
    .optional({ nullable: true })
    .customSanitizer((v) => (v ? String(v).toUpperCase() : v))
    .isIn(MONEDAS)
    .withMessage(`Moneda inválida. Use: ${MONEDAS.join(', ')}`),
  body('precio_unitario_referencia')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0))
    .withMessage('El precio de referencia debe ser un número mayor o igual a 0'),
  body('stock_minimo')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0))
    .withMessage('El stock mínimo debe ser un número mayor o igual a 0'),
  body('proveedor').optional({ nullable: true }).isLength({ max: 150 }).withMessage('Nombre de proveedor demasiado largo'),
];

const reglasMovimiento = [
  body('tipo').isIn(TIPOS_MOVIMIENTO).withMessage(`Tipo inválido. Use: ${TIPOS_MOVIMIENTO.join(', ')}`),
  body('cantidad')
    .custom((v) => !Number.isNaN(Number(v)) && Number(v) > 0)
    .withMessage('La cantidad debe ser un número mayor a 0'),
  body('precio_unitario')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0))
    .withMessage('El precio unitario debe ser un número mayor o igual a 0'),
  body('precio_unitario').custom((v, { req }) => {
    if (req.body.tipo === 'entrada' && vacio(v)) throw new Error('Las entradas necesitan un precio unitario.');
    return true;
  }),
  body('moneda')
    .optional({ nullable: true })
    .customSanitizer((v) => (v ? String(v).toUpperCase() : v))
    .isIn(MONEDAS)
    .withMessage(`Moneda inválida. Use: ${MONEDAS.join(', ')}`),
  body('moneda').custom((v, { req }) => {
    if (req.body.tipo === 'entrada' && vacio(v)) throw new Error('Las entradas necesitan la moneda en la que se pagó.');
    return true;
  }),
  body('fecha').optional({ nullable: true }).isISO8601().withMessage('Fecha inválida'),
  body('descripcion').optional({ nullable: true }).isLength({ max: 255 }).withMessage('Descripción demasiado larga'),
];

router.use(proteger);

router.get('/', [query('activo').optional().isIn(['true', 'false'])], validar, listar);
router.get('/alertas-stock', alertasStock);
// Inventario completo (leche + productos). Va antes de '/:id' para que
// Express no lo lea como un id.
router.get(
  '/resumen',
  [query('fecha_inicio').optional().isISO8601(), query('fecha_fin').optional().isISO8601()],
  validar,
  resumenInventario
);
router.get('/:id', [param('id').isInt().withMessage('Id inválido')], validar, obtener);
router.post('/', reglasInsumo(true), validar, crear);
router.put('/:id', [param('id').isInt().withMessage('Id inválido'), ...reglasInsumo(false)], validar, actualizar);
router.delete('/:id', permitirRoles('admin'), [param('id').isInt()], validar, eliminar);

router.get('/:id/movimientos', [param('id').isInt().withMessage('Id inválido')], validar, listarMovimientos);
router.post('/:id/movimientos', [param('id').isInt().withMessage('Id inválido'), ...reglasMovimiento], validar, crearMovimiento);
router.delete(
  '/movimientos/:movimientoId',
  permitirRoles('admin', 'contabilidad'),
  [param('movimientoId').isInt()],
  validar,
  anularMovimiento
);

module.exports = router;