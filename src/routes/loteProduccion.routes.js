const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  listar,
  historialPorcentaje,
  crear,
  actualizar,
  registrarElaboracion,
} = require('../controllers/loteProduccion.controller');
const { proteger } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

router.use(proteger);

router.get('/', listar);
router.get('/historial-porcentaje', historialPorcentaje);

router.post(
  '/',
  [
    body('fecha').isDate().withMessage('fecha invalida'),
    body('litros_utilizados').isFloat({ gt: 0 }).withMessage('litros_utilizados debe ser mayor a 0'),
    body('kilos_obtenidos').isFloat({ gt: 0 }).withMessage('kilos_obtenidos debe ser mayor a 0'),
  ],
  validar,
  crear
);

router.put('/:id', actualizar);
router.post('/:id/elaboracion', registrarElaboracion);

module.exports = router;
