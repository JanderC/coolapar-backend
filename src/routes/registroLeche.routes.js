const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { listar, crear, actualizar, eliminar } = require('../controllers/registroLeche.controller');
const { proteger, permitirRoles } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

router.use(proteger);

router.get('/', listar);

router.post(
  '/',
  [
    body('productor_id').isInt().withMessage('productor_id es obligatorio'),
    body('semana_id').isInt().withMessage('semana_id es obligatorio'),
    body('fecha').isDate().withMessage('fecha invalida'),
    body('litros').isFloat({ gt: 0 }).withMessage('litros debe ser mayor a 0'),
  ],
  validar,
  crear
);

router.put('/:id', actualizar);
router.delete('/:id', permitirRoles('admin', 'contabilidad'), eliminar);

module.exports = router;
