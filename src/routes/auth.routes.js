const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { registrar, login, perfil } = require('../controllers/auth.controller');
const { proteger, permitirRoles } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

// NOTA: en produccion se recomienda proteger este endpoint (proteger, permitirRoles('admin'))
// una vez exista al menos un usuario admin creado manualmente.
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
