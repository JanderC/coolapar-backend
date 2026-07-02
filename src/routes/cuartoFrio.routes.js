const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { listar, obtener, crear, retirar } = require('../controllers/cuartoFrio.controller');
const { proteger } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

router.use(proteger);

router.get('/', listar);
router.get('/:id', obtener);

router.post(
  '/',
  [
    body('elaboracion_id').isInt().withMessage('elaboracion_id es obligatorio'),
    body('fecha_ingreso').isDate().withMessage('fecha_ingreso invalida'),
    body('peso_inicial').isFloat({ gt: 0 }).withMessage('peso_inicial debe ser mayor a 0'),
  ],
  validar,
  crear
);

router.put('/:id/retirar', retirar);

module.exports = router;
