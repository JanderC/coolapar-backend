const express = require('express');
const { body, param, query } = require('express-validator');
const { Op } = require('sequelize');

const db = require('../../models');
const { Sucursal } = db;
const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');

const router = express.Router();

const vacio = (v) => v === undefined || v === null || v === '';
const MONEDAS = ['BS', 'USD', 'COP'];

const normalizarCampos = (body = {}) => {
  const datos = {};
  if (body.nombre !== undefined) datos.nombre = String(body.nombre).trim();
  if (body.encargado !== undefined) datos.encargado = vacio(body.encargado) ? null : String(body.encargado).trim();
  if (body.telefono !== undefined) datos.telefono = vacio(body.telefono) ? null : String(body.telefono).trim();
  if (body.direccion !== undefined) datos.direccion = vacio(body.direccion) ? null : String(body.direccion).trim();
  if (body.notas !== undefined) datos.notas = vacio(body.notas) ? null : String(body.notas).trim();
  if (body.moneda !== undefined) datos.moneda = String(body.moneda || 'BS').toUpperCase();
  if (body.activo !== undefined) datos.activo = body.activo === true || body.activo === 'true';
  return datos;
};

const validarDatos = (datos, { esCreacion }) => {
  if (esCreacion && !datos.nombre) return 'El nombre de la sucursal es obligatorio.';
  if (datos.nombre !== undefined && !datos.nombre) return 'El nombre de la sucursal es obligatorio.';
  if (datos.moneda !== undefined && !MONEDAS.includes(datos.moneda)) {
    return `Moneda inválida. Use una de: ${MONEDAS.join(', ')}.`;
  }
  return null;
};

// @desc  Listado de sucursales, con quién tiene acceso a cada una.
// @route GET /api/sucursales?activo=true&buscar=
const listar = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.activo !== undefined) where.activo = req.query.activo === 'true';
  if (!vacio(req.query.buscar)) where.nombre = { [Op.iLike]: `%${String(req.query.buscar).trim()}%` };

  // Los usuarios se incluyen solo si el modelo ya tiene la relación: así
  // esto funciona aunque todavía no se haya agregado sucursal_id.
  const puedeIncluirUsuarios = Boolean(db.Usuario && db.Usuario.rawAttributes.sucursal_id);

  const sucursales = await Sucursal.findAll({
    where,
    include: puedeIncluirUsuarios
      ? [{ model: db.Usuario, as: 'Usuarios', required: false, attributes: ['id', 'nombre', 'email', 'rol', 'activo'] }]
      : [],
    order: [['nombre', 'ASC']],
  });

  res.json({
    success: true,
    data: sucursales,
    // La pantalla usa esto para avisar si falta el paso de la migración.
    usuarios_vinculados: puedeIncluirUsuarios,
  });
});

const obtener = asyncHandler(async (req, res) => {
  const sucursal = await Sucursal.findByPk(req.params.id);
  if (!sucursal) return res.status(404).json({ success: false, message: 'Sucursal no encontrada.' });
  res.json({ success: true, data: sucursal });
});

const crear = asyncHandler(async (req, res) => {
  const datos = normalizarCampos(req.body);

  const error = validarDatos(datos, { esCreacion: true });
  if (error) return res.status(400).json({ success: false, message: error });

  const repetida = await Sucursal.findOne({ where: { nombre: { [Op.iLike]: datos.nombre } } });
  if (repetida) {
    return res.status(400).json({ success: false, message: `Ya existe una sucursal llamada «${repetida.nombre}».` });
  }

  const sucursal = await Sucursal.create(datos);
  res.status(201).json({ success: true, message: 'Sucursal creada.', data: sucursal });
});

const actualizar = asyncHandler(async (req, res) => {
  const sucursal = await Sucursal.findByPk(req.params.id);
  if (!sucursal) return res.status(404).json({ success: false, message: 'Sucursal no encontrada.' });

  const datos = normalizarCampos(req.body);
  const error = validarDatos(datos, { esCreacion: false });
  if (error) return res.status(400).json({ success: false, message: error });

  await sucursal.update(datos);
  res.json({ success: true, message: 'Sucursal actualizada.', data: sucursal });
});

const archivar = asyncHandler(async (req, res) => {
  const sucursal = await Sucursal.findByPk(req.params.id);
  if (!sucursal) return res.status(404).json({ success: false, message: 'Sucursal no encontrada.' });

  // Se archiva, no se borra: sus ventas y despachos tienen que seguir
  // apuntando a algún lado.
  await sucursal.update({ activo: false });
  res.json({ success: true, message: 'Sucursal archivada.' });
});

// ---------- Reglas ----------
const reglasSucursal = (esCreacion) => [
  esCreacion
    ? body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio')
    : body('nombre').optional().trim().notEmpty().withMessage('El nombre no puede quedar vacío'),
  body('moneda').optional({ nullable: true }).customSanitizer((v) => (v ? String(v).toUpperCase() : v)).isIn(MONEDAS),
  body('telefono').optional({ nullable: true }).isLength({ max: 30 }).withMessage('Teléfono demasiado largo'),
  body('direccion').optional({ nullable: true }).isLength({ max: 255 }).withMessage('Dirección demasiado larga'),
  body('notas').optional({ nullable: true }).isLength({ max: 255 }).withMessage('Nota demasiado larga'),
];

router.use(proteger);

// El manejo de sucursales es solo del administrador: un usuario de
// sucursal no puede crearse otra ni ver las demás.
router.get('/', permitirRoles('admin', 'contabilidad'), [query('activo').optional().isIn(['true', 'false'])], validar, listar);
router.get('/:id', permitirRoles('admin', 'contabilidad'), [param('id').isInt()], validar, obtener);
router.post('/', permitirRoles('admin'), reglasSucursal(true), validar, crear);
router.put('/:id', permitirRoles('admin'), [param('id').isInt(), ...reglasSucursal(false)], validar, actualizar);
router.delete('/:id', permitirRoles('admin'), [param('id').isInt()], validar, archivar);

module.exports = router;