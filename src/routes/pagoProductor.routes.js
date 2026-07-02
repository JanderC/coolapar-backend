const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { listar, generar, generarSemana, marcarPagado } = require('../controllers/pagoProductor.controller');
const { proteger, permitirRoles } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

router.use(proteger);

router.get('/', listar);

router.post(
  '/generar',
  [
    body('productor_id').isInt().withMessage('productor_id es obligatorio'),
    body('semana_id').isInt().withMessage('semana_id es obligatorio'),
  ],
  validar,
  permitirRoles('admin', 'contabilidad'),
  generar
);

router.post(
  '/generar-semana',
  [body('semana_id').isInt().withMessage('semana_id es obligatorio')],
  validar,
  permitirRoles('admin', 'contabilidad'),
  generarSemana
);

router.put('/:id/pagar', permitirRoles('admin', 'contabilidad'), marcarPagado);

module.exports = router;
