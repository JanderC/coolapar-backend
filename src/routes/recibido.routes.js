const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { listar, obtener, crear, actualizar } = require('../controllers/recibido.controller');
const { proteger } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

router.use(proteger);

router.get('/', listar);
router.get('/:id', obtener);

router.post(
  '/',
  [
    body('fecha').isDate().withMessage('fecha invalida'),
    body('litros_traidos').isFloat({ gt: 0 }).withMessage('litros_traidos debe ser mayor a 0'),
    body('detalle').optional().isArray().withMessage('detalle debe ser un arreglo'),
  ],
  validar,
  crear
);

router.put('/:id', actualizar);

module.exports = router;
