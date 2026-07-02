const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { listar, crear, actualizar } = require('../controllers/fleteTransportador.controller');
const { proteger } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

router.use(proteger);

router.get('/', listar);

router.post(
  '/',
  [
    body('transportador_id').isInt().withMessage('transportador_id es obligatorio'),
    body('fecha').isDate().withMessage('fecha invalida'),
  ],
  validar,
  crear
);

router.put('/:id', actualizar);

module.exports = router;
