const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { listar, crear, registrarPeso } = require('../controllers/piezaQueso.controller');
const { proteger } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

router.use(proteger);

router.get('/', listar);

router.post(
  '/',
  [
    body('cuarto_frio_id').isInt().withMessage('cuarto_frio_id es obligatorio'),
    body('numero_pieza').notEmpty().withMessage('numero_pieza es obligatorio'),
    body('peso_inicial').isFloat({ gt: 0 }).withMessage('peso_inicial debe ser mayor a 0'),
  ],
  validar,
  crear
);

router.post(
  '/:id/pesar',
  [
    body('fecha').isDate().withMessage('fecha invalida'),
    body('peso').isFloat({ gt: 0 }).withMessage('peso debe ser mayor a 0'),
  ],
  validar,
  registrarPeso
);

module.exports = router;
