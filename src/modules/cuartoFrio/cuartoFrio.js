const express = require('express');
const { body, param, query } = require('express-validator');
const { Op } = require('sequelize');

const { MovimientoCuartoFrio, LoteProduccion } = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');
const cuartoFrioService = require('../../services/cuartoFrio.service');

const router = express.Router();

const vacio = (v) => v === undefined || v === null || v === '';
const redondearKg = (n) => Number(Number(n || 0).toFixed(3));

// Etiquetas legibles de cada tipo, para que la pantalla no tenga que
// traducirlas y los reportes salgan iguales en todos lados.
const ETIQUETAS = {
  produccion: 'Entró de producción',
  devolucion: 'Devolución de cliente',
  descarte: 'Descartado',
  reproceso: 'Usado para reprocesar',
  salida: 'Salida',
  ajuste: 'Ajuste manual',
};

// ---------- Inventario ----------

// @desc  Existencia por producto + totales del cuarto frio.
// @route GET /api/cuarto-frio/existencias
const existencias = asyncHandler(async (req, res) => {
  const mapa = await cuartoFrioService.existenciaPorProducto();

  // Los productos que quedaron en cero (todo lo producido ya se
  // reproceso o salio) no se muestran, pero su historial sigue ahi.
  const productos = [...mapa.values()]
    .filter((p) => p.kilos > 0.0005 || p.piezas > 0)
    .sort((a, b) => a.producto.localeCompare(b.producto, 'es'));

  res.json({
    success: true,
    data: {
      productos,
      totales: {
        productos: productos.length,
        kilos: redondearKg(productos.reduce((s, p) => s + p.kilos, 0)),
        piezas: productos.reduce((s, p) => s + p.piezas, 0),
      },
    },
  });
});

// @desc  Libro de movimientos, con filtros.
// @route GET /api/cuarto-frio/movimientos?producto=&tipo=&fecha_inicio=&fecha_fin=
const listarMovimientos = asyncHandler(async (req, res) => {
  const { producto, tipo, fecha_inicio, fecha_fin } = req.query;
  const where = {};
  if (!vacio(producto)) where.producto = { [Op.iLike]: `%${String(producto).trim()}%` };
  if (!vacio(tipo)) where.tipo = tipo;
  if (!vacio(fecha_inicio) && !vacio(fecha_fin)) where.fecha = { [Op.between]: [fecha_inicio, fecha_fin] };

  const movimientos = await MovimientoCuartoFrio.findAll({
    where,
    order: [
      ['fecha', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: 300,
  });

  res.json({
    success: true,
    data: movimientos.map((m) => ({
      ...m.toJSON(),
      etiqueta_tipo: ETIQUETAS[m.tipo] || m.tipo,
      // Positivo si suma al inventario, negativo si resta. Ahorra que
      // cada pantalla vuelva a razonar el signo.
      kilos_con_signo: redondearKg(Number(m.kilos) * m.signo),
    })),
  });
});

// ---------- Devoluciones ----------

// @desc  Registrar queso que volvio de un cliente.
// @route POST /api/cuarto-frio/devoluciones
const crearDevolucion = asyncHandler(async (req, res) => {
  try {
    const { devolucion, descarte } = await cuartoFrioService.registrarDevolucion(req.body);
    res.status(201).json({
      success: true,
      message: descarte
        ? 'Devolución registrada y descartada: no entra al inventario.'
        : 'Devolución registrada. Ya está disponible para reprocesar.',
      data: devolucion,
    });
  } catch (err) {
    if (err.esErrorDeNegocio) return res.status(400).json({ success: false, message: err.message });
    throw err;
  }
});

// @desc  Solo las devoluciones, para la pantalla de devoluciones.
// @route GET /api/cuarto-frio/devoluciones
const listarDevoluciones = asyncHandler(async (req, res) => {
  const { fecha_inicio, fecha_fin, producto } = req.query;
  const where = { tipo: 'devolucion', signo: 1 };
  if (!vacio(producto)) where.producto = { [Op.iLike]: `%${String(producto).trim()}%` };
  if (!vacio(fecha_inicio) && !vacio(fecha_fin)) where.fecha = { [Op.between]: [fecha_inicio, fecha_fin] };

  const devoluciones = await MovimientoCuartoFrio.findAll({
    where,
    order: [
      ['fecha', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: 300,
  });

  // Una devolucion anulada tiene su reverso con signo -1. Se marcan para
  // que la pantalla las muestre tachadas en vez de esconderlas.
  const anuladas = await MovimientoCuartoFrio.findAll({
    where: { tipo: 'devolucion', signo: -1 },
    attributes: ['descripcion'],
  });
  const idsAnulados = new Set(
    anuladas
      .map((a) => {
        const encontrado = /#(\d+)/.exec(a.descripcion || '');
        return encontrado ? Number(encontrado[1]) : null;
      })
      .filter(Boolean)
  );

  res.json({
    success: true,
    data: devoluciones.map((d) => ({ ...d.toJSON(), anulada: idsAnulados.has(d.id) })),
  });
});

// @desc  Deshacer una devolucion.
// @route DELETE /api/cuarto-frio/devoluciones/:id
const anularDevolucion = asyncHandler(async (req, res) => {
  try {
    await cuartoFrioService.anularDevolucion(req.params.id);
    res.json({ success: true, message: 'Devolución anulada.' });
  } catch (err) {
    if (err.esErrorDeNegocio) return res.status(400).json({ success: false, message: err.message });
    throw err;
  }
});

// ---------- Ajuste manual ----------

// @desc  Corregir el inventario a mano (conteo fisico, perdida, merma).
// @route POST /api/cuarto-frio/ajustes
const crearAjuste = asyncHandler(async (req, res) => {
  const producto = String(req.body.producto || '').trim();
  const kilos = Number(req.body.kilos);
  const suma = req.body.suma === true || req.body.suma === 'true';

  if (!producto) return res.status(400).json({ success: false, message: 'Indique el producto.' });
  if (Number.isNaN(kilos) || kilos <= 0) {
    return res.status(400).json({ success: false, message: 'Los kilos deben ser mayores a 0.' });
  }

  if (!suma) {
    const disponible = await cuartoFrioService.existenciaDe(producto);
    if (kilos > disponible.kilos) {
      return res.status(400).json({
        success: false,
        message: `No se puede restar ${kilos} kg: de ${producto} solo hay ${disponible.kilos} kg.`,
      });
    }
  }

  const movimiento = await MovimientoCuartoFrio.create({
    fecha: req.body.fecha || undefined,
    producto,
    tipo: 'ajuste',
    signo: suma ? 1 : -1,
    kilos: redondearKg(kilos),
    piezas: vacio(req.body.piezas) ? null : Number.parseInt(req.body.piezas, 10),
    motivo: vacio(req.body.motivo) ? null : String(req.body.motivo).trim(),
    descripcion: 'Ajuste manual de inventario',
  });

  res.status(201).json({ success: true, message: 'Inventario ajustado.', data: movimiento });
});

// ---------- Lista de productos conocidos ----------
// Sirve para los selectores: junta lo que hay en cuarto frio con los
// productos que alguna vez se fabricaron.
const productosConocidos = asyncHandler(async (req, res) => {
  const [enFrio, enLotes] = await Promise.all([
    MovimientoCuartoFrio.findAll({ attributes: ['producto'], group: ['producto'], raw: true }),
    LoteProduccion.findAll({ attributes: ['producto'], group: ['producto'], raw: true }),
  ]);

  const nombres = [...new Set([...enFrio, ...enLotes].map((f) => f.producto).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );

  res.json({ success: true, data: nombres });
});

// ---------- Reglas ----------
const reglasDevolucion = [
  body('producto').trim().notEmpty().withMessage('Indique el producto devuelto'),
  body('kilos')
    .custom((v) => !Number.isNaN(Number(v)) && Number(v) > 0)
    .withMessage('Los kilos deben ser un número mayor a 0'),
  body('piezas').optional({ nullable: true }).isInt({ min: 0 }).withMessage('Las piezas deben ser un número entero'),
  body('fecha').optional({ nullable: true }).isISO8601().withMessage('Fecha inválida'),
  body('cliente').optional({ nullable: true }).isLength({ max: 150 }).withMessage('Nombre de cliente demasiado largo'),
  body('motivo').optional({ nullable: true }).isLength({ max: 255 }).withMessage('Motivo demasiado largo'),
];

router.use(proteger);

router.get('/existencias', existencias);
router.get('/productos', productosConocidos);
router.get(
  '/movimientos',
  [query('fecha_inicio').optional().isISO8601(), query('fecha_fin').optional().isISO8601()],
  validar,
  listarMovimientos
);

router.get('/devoluciones', listarDevoluciones);
router.post('/devoluciones', reglasDevolucion, validar, crearDevolucion);
router.delete(
  '/devoluciones/:id',
  permitirRoles('admin', 'contabilidad'),
  [param('id').isInt().withMessage('Id inválido')],
  validar,
  anularDevolucion
);

router.post('/ajustes', permitirRoles('admin', 'contabilidad'), crearAjuste);

module.exports = router;
