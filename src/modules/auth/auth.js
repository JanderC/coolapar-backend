const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const express = require('express');
const { body } = require('express-validator');

const { Usuario, Sucursal } = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const env = require('../../config/env');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');

const router = express.Router();

const generarToken = (usuario) =>
  jwt.sign({ id: usuario.id, rol: usuario.rol }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

/**
 * Lo que se le devuelve al frontend al iniciar sesion.
 *
 * La sucursal viaja aqui para que la aplicacion sepa que vistas mostrar,
 * pero el permiso NO depende de este dato: cada peticion lo vuelve a
 * leer de la base de datos en el middleware. Si dependiera del token, un
 * usuario podria editarlo y cambiarse de sucursal.
 */
const datosDeSesion = (usuario, sucursal = null) => ({
  id: usuario.id,
  nombre: usuario.nombre,
  email: usuario.email,
  rol: usuario.rol,
  sucursal_id: usuario.sucursal_id || null,
  sucursal: sucursal ? { id: sucursal.id, nombre: sucursal.nombre, moneda: sucursal.moneda } : null,
  token: generarToken(usuario),
});

const ROLES = Usuario.ROLES || ['admin', 'operador', 'contabilidad', 'sucursal'];

// @desc  Registrar un nuevo usuario del sistema
// @route POST /api/auth/registro   (solo admin autenticado)
//
// OJO: esta ruta estaba ABIERTA. Como el rol llega en el cuerpo,
// cualquiera podia crearse un usuario admin y entrar a todo el sistema.
// Ahora exige sesion de administrador.
const registrar = asyncHandler(async (req, res) => {
  const { nombre, email, password, rol, sucursal_id } = req.body;

  const existe = await Usuario.findOne({ where: { email } });
  if (existe) {
    return res.status(400).json({ success: false, message: 'Ya existe un usuario con ese email.' });
  }

  const rolFinal = rol || 'operador';
  if (!ROLES.includes(rolFinal)) {
    return res.status(400).json({ success: false, message: `Rol inválido. Use: ${ROLES.join(', ')}.` });
  }

  // Un usuario de sucursal sin sucursal no podria ver nada, y peor: si
  // algun filtro se dejara vacio, veria lo de todas.
  let sucursal = null;
  if (rolFinal === 'sucursal') {
    if (!sucursal_id) {
      return res.status(400).json({ success: false, message: 'Elija a qué sucursal pertenece este usuario.' });
    }
    sucursal = await Sucursal.findByPk(sucursal_id);
    if (!sucursal) return res.status(400).json({ success: false, message: 'La sucursal no existe.' });
    if (!sucursal.activo) {
      return res.status(400).json({ success: false, message: `${sucursal.nombre} está archivada.` });
    }
  }

  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);
  const usuario = await Usuario.create({
    nombre,
    email,
    password_hash,
    rol: rolFinal,
    sucursal_id: rolFinal === 'sucursal' ? Number(sucursal_id) : null,
  });

  // Sin token: lo crea un administrador para otra persona, no para si
  // mismo. Devolverlo aqui cerraria su propia sesion en el frontend.
  res.status(201).json({
    success: true,
    message: 'Usuario creado.',
    data: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      sucursal_id: usuario.sucursal_id,
    },
  });
});

// @desc  Iniciar sesion
// @route POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const usuario = await Usuario.findOne({ where: { email } });
  if (!usuario || !usuario.activo) {
    return res.status(401).json({ success: false, message: 'Credenciales invalidas.' });
  }

  const passwordValido = await bcrypt.compare(password, usuario.password_hash);
  if (!passwordValido) {
    return res.status(401).json({ success: false, message: 'Credenciales invalidas.' });
  }

  // Un usuario de sucursal cuya sucursal fue archivada no debe entrar:
  // no tendria nada que ver ni a donde despachar.
  let sucursal = null;
  if (usuario.rol === 'sucursal') {
    sucursal = usuario.sucursal_id ? await Sucursal.findByPk(usuario.sucursal_id) : null;
    if (!sucursal || !sucursal.activo) {
      return res.status(403).json({
        success: false,
        message: 'Su sucursal no está disponible. Comuníquese con el administrador.',
      });
    }
  }

  res.json({ success: true, data: datosDeSesion(usuario, sucursal) });
});

// @desc  Obtener el perfil del usuario autenticado
// @route GET /api/auth/perfil
const perfil = asyncHandler(async (req, res) => {
  const sucursal = req.usuario.sucursal_id ? await Sucursal.findByPk(req.usuario.sucursal_id) : null;
  res.json({
    success: true,
    data: {
      ...req.usuario.toJSON(),
      sucursal: sucursal ? { id: sucursal.id, nombre: sucursal.nombre, moneda: sucursal.moneda } : null,
    },
  });
});

// ---------- Rutas ----------
router.post(
  '/registro',
  // Cerrada a proposito: solo un administrador con sesion abierta puede
  // crear usuarios.
  proteger,
  permitirRoles('admin'),
  [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
    body('email').isEmail().withMessage('Email invalido'),
    body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener minimo 6 caracteres'),
    body('rol').optional().isIn(ROLES).withMessage(`Rol invalido. Use: ${ROLES.join(', ')}`),
    body('sucursal_id').optional({ nullable: true }).isInt().withMessage('Sucursal invalida'),
  ],
  validar,
  registrar
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Email invalido'),
    body('password').notEmpty().withMessage('La contraseña es obligatoria'),
  ],
  validar,
  login
);

router.get('/perfil', proteger, perfil);

module.exports = router;