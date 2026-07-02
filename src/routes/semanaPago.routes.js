const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { listar, obtenerActual, crear, cerrar } = require('../controllers/semanaPago.controller');
const { proteger, permitirRoles } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

router.use(proteger);

router.get('/', listar);
router.get('/actual', obtenerActual);

router.post(
  '/',
  [body('fecha_inicio').isDate().withMessage('fecha_inicio debe ser una fecha valida')],
  validar,
  permitirRoles('admin', 'contabilidad'),
  crear
);

router.put('/:id/cerrar', permitirRoles('admin', 'contabilidad'), cerrar);

module.exports = router;
