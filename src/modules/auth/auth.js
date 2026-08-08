const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const express = require('express');
const { body } = require('express-validator');

const { Usuario } = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const env = require('../../config/env');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');

const router = express.Router();

const generarToken = (usuario) =>
  jwt.sign({ id: usuario.id, rol: usuario.rol }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

// @desc  Registrar un nuevo usuario del sistema
// @route POST /api/auth/registro
const registrar = asyncHandler(async (req, res) => {
  const { nombre, email, password, rol } = req.body;

  const existe = await Usuario.findOne({ where: { email } });
  if (existe) {
    return res.status(400).json({ success: false, message: 'Ya existe un usuario con ese email.' });
  }

  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);
  const usuario = await Usuario.create({ nombre, email, password_hash, rol });

  res.status(201).json({
    success: true,
    data: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      token: generarToken(usuario),
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

  res.json({
    success: true,
    data: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      token: generarToken(usuario),
    },
  });
});

// @desc  Obtener el perfil del usuario autenticado
// @route GET /api/auth/perfil
const perfil = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.usuario });
});

// ---------- Rutas ----------
router.post(
  '/registro',
  [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
    body('email').isEmail().withMessage('Email invalido'),
    body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener minimo 6 caracteres'),
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