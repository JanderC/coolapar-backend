const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, query } = require('express-validator');
const { Op } = require('sequelize');

const { Usuario, Sucursal } = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');

const router = express.Router();

const vacio = (v) => v === undefined || v === null || v === '';
const ROLES = Usuario.ROLES || ['admin', 'operador', 'contabilidad', 'sucursal'];

// Qué puede hacer cada rol, en palabras. La pantalla lo muestra tal cual
// para que quien crea el usuario sepa qué le está dando.
const DESCRIPCION_ROLES = {
  admin: 'Todo el sistema, incluidos usuarios y pagos.',
  operador: 'Carga diaria: leche, producción, inventario. No ve la contabilidad.',
  contabilidad: 'Pagos, nómina, caja y reportes. No carga producción.',
  sucursal: 'Solo su sucursal: lo que recibe y lo que vende.',
};

const sinPassword = { exclude: ['password_hash'] };

// @desc  Listado de usuarios.
// @route GET /api/usuarios?rol=&activo=&buscar=
const listar = asyncHandler(async (req, res) => {
  const where = {};
  if (!vacio(req.query.rol)) where.rol = req.query.rol;
  if (req.query.activo !== undefined) where.activo = req.query.activo === 'true';
  if (!vacio(req.query.buscar)) {
    const texto = `%${String(req.query.buscar).trim()}%`;
    where[Op.or] = [{ nombre: { [Op.iLike]: texto } }, { email: { [Op.iLike]: texto } }];
  }

  const usuarios = await Usuario.findAll({
    where,
    attributes: sinPassword,
    include: [{ model: Sucursal, as: 'Sucursal', required: false, attributes: ['id', 'nombre'] }],
    order: [
      ['activo', 'DESC'],
      ['nombre', 'ASC'],
    ],
  });

  res.json({
    success: true,
    data: usuarios,
    roles: ROLES.map((r) => ({ valor: r, descripcion: DESCRIPCION_ROLES[r] || '' })),
  });
});

/** Valida la pareja rol / sucursal, que es la que sostiene todo el aislamiento. */
const resolverSucursal = async (rol, sucursalId) => {
  if (rol !== 'sucursal') return { sucursal_id: null };

  if (!sucursalId) throw new Error('Elija a qué sucursal pertenece este usuario.');

  const sucursal = await Sucursal.findByPk(sucursalId);
  if (!sucursal) throw new Error('La sucursal no existe.');
  if (!sucursal.activo) throw new Error(`${sucursal.nombre} está archivada.`);

  return { sucursal_id: Number(sucursalId) };
};

const crear = asyncHandler(async (req, res) => {
  const { nombre, email, password, rol, sucursal_id } = req.body;

  const existe = await Usuario.findOne({ where: { email: String(email).trim().toLowerCase() } });
  if (existe) return res.status(400).json({ success: false, message: 'Ya existe un usuario con ese email.' });

  let vinculo;
  try {
    vinculo = await resolverSucursal(rol, sucursal_id);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }

  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);

  const usuario = await Usuario.create({
    nombre: String(nombre).trim(),
    email: String(email).trim().toLowerCase(),
    password_hash,
    rol,
    ...vinculo,
  });

  const creado = await Usuario.findByPk(usuario.id, {
    attributes: sinPassword,
    include: [{ model: Sucursal, as: 'Sucursal', required: false, attributes: ['id', 'nombre'] }],
  });

  res.status(201).json({ success: true, message: 'Usuario creado.', data: creado });
});

const actualizar = asyncHandler(async (req, res) => {
  const usuario = await Usuario.findByPk(req.params.id);
  if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

  const datos = {};
  if (req.body.nombre !== undefined) datos.nombre = String(req.body.nombre).trim();
  if (req.body.email !== undefined) datos.email = String(req.body.email).trim().toLowerCase();

  const rolNuevo = req.body.rol !== undefined ? req.body.rol : usuario.rol;
  if (req.body.rol !== undefined) datos.rol = rolNuevo;

  if (req.body.rol !== undefined || req.body.sucursal_id !== undefined) {
    const idSucursal = req.body.sucursal_id !== undefined ? req.body.sucursal_id : usuario.sucursal_id;
    try {
      Object.assign(datos, await resolverSucursal(rolNuevo, idSucursal));
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // Un admin no puede quitarse a sí mismo el rol ni desactivarse: si es
  // el único, el sistema se queda sin quien administre.
  const esElMismo = Number(usuario.id) === Number(req.usuario.id);
  if (esElMismo && (datos.rol && datos.rol !== 'admin')) {
    return res.status(400).json({ success: false, message: 'No puede quitarse a sí mismo el rol de administrador.' });
  }

  if (req.body.activo !== undefined) {
    const activo = req.body.activo === true || req.body.activo === 'true';
    if (esElMismo && !activo) {
      return res.status(400).json({ success: false, message: 'No puede desactivar su propio usuario.' });
    }
    datos.activo = activo;
  }

  if (datos.email && datos.email !== usuario.email) {
    const repetido = await Usuario.findOne({ where: { email: datos.email, id: { [Op.ne]: usuario.id } } });
    if (repetido) return res.status(400).json({ success: false, message: 'Ese email ya está en uso.' });
  }

  await usuario.update(datos);

  const actualizado = await Usuario.findByPk(usuario.id, {
    attributes: sinPassword,
    include: [{ model: Sucursal, as: 'Sucursal', required: false, attributes: ['id', 'nombre'] }],
  });

  res.json({ success: true, message: 'Usuario actualizado.', data: actualizado });
});

// @desc  Cambiar la contraseña de otro usuario (la olvidó, se le entrega una nueva).
// @route PATCH /api/usuarios/:id/password
const cambiarPassword = asyncHandler(async (req, res) => {
  const usuario = await Usuario.findByPk(req.params.id);
  if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

  const nueva = String(req.body.password || '');
  if (nueva.length < 6) {
    return res.status(400).json({ success: false, message: 'La contraseña debe tener mínimo 6 caracteres.' });
  }

  const salt = await bcrypt.genSalt(10);
  await usuario.update({ password_hash: await bcrypt.hash(nueva, salt) });

  res.json({ success: true, message: `Contraseña actualizada. Entréguesela a ${usuario.nombre}.` });
});

const desactivar = asyncHandler(async (req, res) => {
  const usuario = await Usuario.findByPk(req.params.id);
  if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

  if (Number(usuario.id) === Number(req.usuario.id)) {
    return res.status(400).json({ success: false, message: 'No puede desactivar su propio usuario.' });
  }

  // No se borra: sus ventas y movimientos quedan con su nombre detrás.
  await usuario.update({ activo: false });
  res.json({ success: true, message: 'Usuario desactivado.' });
});

// ---------- Reglas ----------
const reglasCrear = [
  body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener mínimo 6 caracteres'),
  body('rol').isIn(ROLES).withMessage(`Rol inválido. Use: ${ROLES.join(', ')}`),
  body('sucursal_id').optional({ nullable: true }).isInt().withMessage('Sucursal inválida'),
];

const reglasEditar = [
  body('nombre').optional().trim().notEmpty().withMessage('El nombre no puede quedar vacío'),
  body('email').optional().isEmail().withMessage('Email inválido'),
  body('rol').optional().isIn(ROLES).withMessage(`Rol inválido. Use: ${ROLES.join(', ')}`),
  body('sucursal_id').optional({ nullable: true }).isInt().withMessage('Sucursal inválida'),
];

router.use(proteger);
// Todo el módulo es exclusivo del administrador.
router.use(permitirRoles('admin'));

router.get('/', [query('activo').optional().isIn(['true', 'false'])], validar, listar);
router.post('/', reglasCrear, validar, crear);
router.put('/:id', [param('id').isInt(), ...reglasEditar], validar, actualizar);
router.patch('/:id/password', [param('id').isInt()], validar, cambiarPassword);
router.delete('/:id', [param('id').isInt()], validar, desactivar);

module.exports = router;