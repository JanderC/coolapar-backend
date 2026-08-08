const express = require('express');
const { body, param, query } = require('express-validator');
const { Op } = require('sequelize');

const { Productor, Ruta } = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');

const router = express.Router();

const MONEDAS = ['BS', 'USD', 'COP'];
const HEX = /^#[0-9A-Fa-f]{6}$/;

const incluirRuta = [
  { model: Ruta, as: 'Ruta', required: false, attributes: ['id', 'nombre', 'color_identificativo', 'procedencia'] },
];

const vacio = (v) => v === undefined || v === null || v === '';

const normalizarCampos = (body = {}) => {
  const datos = {};
  if (body.nombre !== undefined) datos.nombre = String(body.nombre).trim();
  if (body.telefono !== undefined) datos.telefono = vacio(body.telefono) ? null : String(body.telefono).trim();
  if (body.direccion !== undefined) datos.direccion = vacio(body.direccion) ? null : String(body.direccion).trim();
  if (body.ruta_id !== undefined) datos.ruta_id = vacio(body.ruta_id) ? null : Number(body.ruta_id);
  if (body.precio_litro_base !== undefined) datos.precio_litro_base = vacio(body.precio_litro_base) ? null : Number(body.precio_litro_base);
  if (body.precio_litro_acida !== undefined) datos.precio_litro_acida = vacio(body.precio_litro_acida) ? null : Number(body.precio_litro_acida);
  if (body.precio_litro_bajo_grasa !== undefined) datos.precio_litro_bajo_grasa = vacio(body.precio_litro_bajo_grasa) ? null : Number(body.precio_litro_bajo_grasa);
  if (body.moneda !== undefined) datos.moneda = vacio(body.moneda) ? 'BS' : String(body.moneda).toUpperCase();
  if (body.color_identificativo !== undefined) {
    datos.color_identificativo = vacio(body.color_identificativo) ? null : String(body.color_identificativo).toUpperCase();
  }
  if (body.activo !== undefined) datos.activo = body.activo === true || body.activo === 'true';
  return datos;
};

const validarDatos = async (datos, { esCreacion }) => {
  if (esCreacion && !datos.nombre) return 'El nombre del productor es obligatorio.';
  if (datos.nombre !== undefined && !datos.nombre) return 'El nombre del productor es obligatorio.';
  if (datos.moneda !== undefined && !MONEDAS.includes(datos.moneda)) return `Moneda inválida. Use una de: ${MONEDAS.join(', ')}.`;
  if (datos.color_identificativo && !HEX.test(datos.color_identificativo)) return 'El color debe ser hexadecimal de 6 dígitos, ej: #FF5733.';

  if (datos.precio_litro_base !== undefined && datos.precio_litro_base !== null) {
    if (Number.isNaN(datos.precio_litro_base) || datos.precio_litro_base < 0) return 'El precio por litro debe ser un número mayor o igual a 0.';
  }
  if (datos.precio_litro_acida !== undefined && datos.precio_litro_acida !== null) {
    if (Number.isNaN(datos.precio_litro_acida) || datos.precio_litro_acida < 0) return 'El precio de la leche ácida debe ser un número mayor o igual a 0.';
  }
  if (datos.precio_litro_bajo_grasa !== undefined && datos.precio_litro_bajo_grasa !== null) {
    if (Number.isNaN(datos.precio_litro_bajo_grasa) || datos.precio_litro_bajo_grasa < 0) return 'El precio de la leche baja en grasa debe ser un número mayor o igual a 0.';
  }
  if (datos.ruta_id) {
    const ruta = await Ruta.findByPk(datos.ruta_id);
    if (!ruta) return 'La ruta seleccionada no existe.';
  }
  return null;
};

const listar = asyncHandler(async (req, res) => {
  const { activo, ruta_id, buscar } = req.query;
  const where = {};
  if (activo !== undefined) where.activo = activo === 'true';
  if (!vacio(ruta_id)) where.ruta_id = Number(ruta_id);
  if (!vacio(buscar)) where.nombre = { [Op.iLike]: `%${String(buscar).trim()}%` };

  const productores = await Productor.findAll({ where, include: incluirRuta, order: [['nombre', 'ASC']] });
  res.json({ success: true, data: productores });
});

const nivelesPrecio = asyncHandler(async (req, res) => {
  const productores = await Productor.findAll({
    where: { activo: true, precio_litro_base: { [Op.ne]: null } },
    attributes: ['moneda', 'precio_litro_base', 'color_identificativo'],
    order: [['moneda', 'ASC'], ['precio_litro_base', 'ASC']],
  });

  const mapa = new Map();
  productores.forEach((p) => {
    const clave = `${p.moneda}-${p.precio_litro_base}`;
    if (!mapa.has(clave)) {
      mapa.set(clave, { moneda: p.moneda, precio_litro_base: p.precio_litro_base, color_identificativo: p.color_identificativo, productores: 0 });
    }
    const nivel = mapa.get(clave);
    nivel.productores += 1;
    if (!nivel.color_identificativo && p.color_identificativo) nivel.color_identificativo = p.color_identificativo;
  });

  res.json({ success: true, data: [...mapa.values()] });
});

const obtener = asyncHandler(async (req, res) => {
  const productor = await Productor.findByPk(req.params.id, { include: incluirRuta });
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });
  res.json({ success: true, data: productor });
});

const crear = asyncHandler(async (req, res) => {
  const datos = normalizarCampos(req.body);
  if (datos.moneda === undefined) datos.moneda = 'BS';

  const error = await validarDatos(datos, { esCreacion: true });
  if (error) return res.status(400).json({ success: false, message: error });

  const creado = await Productor.create(datos);
  const productor = await Productor.findByPk(creado.id, { include: incluirRuta });
  res.status(201).json({ success: true, data: productor });
});

const actualizar = asyncHandler(async (req, res) => {
  const productor = await Productor.findByPk(req.params.id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  const datos = normalizarCampos(req.body);
  const error = await validarDatos(datos, { esCreacion: false });
  if (error) return res.status(400).json({ success: false, message: error });

  await productor.update(datos);
  const actualizado = await Productor.findByPk(productor.id, { include: incluirRuta });
  res.json({ success: true, data: actualizado });
});

const colorPorPrecio = asyncHandler(async (req, res) => {
  const moneda = String(req.body.moneda || 'BS').toUpperCase();
  const precio = Number(req.body.precio_litro_base);
  const color = String(req.body.color_identificativo || '').toUpperCase();

  if (!MONEDAS.includes(moneda)) return res.status(400).json({ success: false, message: `Moneda inválida. Use: ${MONEDAS.join(', ')}.` });
  if (Number.isNaN(precio) || precio < 0) return res.status(400).json({ success: false, message: 'Indique un precio por litro válido.' });
  if (!HEX.test(color)) return res.status(400).json({ success: false, message: 'El color debe ser hexadecimal, ej: #FF5733.' });

  const [afectados] = await Productor.update({ color_identificativo: color }, { where: { moneda, precio_litro_base: precio } });

  res.json({
    success: true,
    message: `Color aplicado a ${afectados} productor(es) con ese precio.`,
    data: { moneda, precio_litro_base: precio, color_identificativo: color, afectados },
  });
});

const eliminar = asyncHandler(async (req, res) => {
  const productor = await Productor.findByPk(req.params.id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  await productor.update({ activo: false });
  res.json({ success: true, message: 'Productor desactivado.' });
});

// ---------- Rutas ----------
const reglasProductor = (esCreacion) => [
  esCreacion
    ? body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio')
    : body('nombre').optional().trim().notEmpty().withMessage('El nombre no puede quedar vacío'),
  body('ruta_id').optional({ nullable: true }).customSanitizer((v) => (v === '' ? null : v)).custom((v) => v === null || Number.isInteger(Number(v))).withMessage('Ruta inválida'),
  body('color_identificativo').optional({ nullable: true }).customSanitizer((v) => (v === '' ? null : v)).custom((v) => v === null || HEX.test(v)).withMessage('El color debe ser hexadecimal, ej: #FF5733'),
  body('moneda').optional({ nullable: true }).customSanitizer((v) => (v ? String(v).toUpperCase() : v)).isIn(MONEDAS).withMessage(`Moneda inválida. Use: ${MONEDAS.join(', ')}`),
  body('precio_litro_base').optional({ nullable: true }).customSanitizer((v) => (v === '' ? null : v)).custom((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0)).withMessage('El precio por litro debe ser un número mayor o igual a 0'),
  body('precio_litro_acida').optional({ nullable: true }).customSanitizer((v) => (v === '' ? null : v)).custom((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0)).withMessage('El precio de la leche ácida debe ser un número mayor o igual a 0'),
  body('precio_litro_bajo_grasa').optional({ nullable: true }).customSanitizer((v) => (v === '' ? null : v)).custom((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0)).withMessage('El precio de la leche baja en grasa debe ser un número mayor o igual a 0'),
  body('telefono').optional({ nullable: true }).isLength({ max: 30 }).withMessage('Teléfono demasiado largo'),
  body('direccion').optional({ nullable: true }).isLength({ max: 255 }).withMessage('Dirección demasiado larga'),
];

router.use(proteger);

router.get('/', [query('activo').optional().isIn(['true', 'false']), query('ruta_id').optional().isInt()], validar, listar);
router.get('/niveles-precio', nivelesPrecio);
router.get('/:id', [param('id').isInt().withMessage('Id inválido')], validar, obtener);
router.post('/', reglasProductor(true), validar, crear);
router.put('/:id', [param('id').isInt().withMessage('Id inválido'), ...reglasProductor(false)], validar, actualizar);
router.patch(
  '/color-por-precio',
  permitirRoles('admin', 'contabilidad'),
  [
    body('moneda').customSanitizer((v) => String(v || '').toUpperCase()).isIn(MONEDAS),
    body('precio_litro_base').custom((v) => !Number.isNaN(Number(v)) && Number(v) >= 0),
    body('color_identificativo').matches(HEX).withMessage('Color hexadecimal inválido'),
  ],
  validar,
  colorPorPrecio
);
router.delete('/:id', permitirRoles('admin'), [param('id').isInt()], validar, eliminar);

module.exports = router;