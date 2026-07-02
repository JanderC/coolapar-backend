const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { listar, obtener, crear, actualizar, eliminar } = require('../controllers/productor.controller');
const { proteger, permitirRoles } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

router.use(proteger);

router.get('/', listar);
router.get('/:id', obtener);

router.post(
  '/',
  [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
    body('color_identificativo')
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage('El color debe ser un hexadecimal valido, ej: #FF5733'),
  ],
  validar,
  crear
);

router.put('/:id', actualizar);
router.delete('/:id', permitirRoles('admin'), eliminar);

module.exports = router;
