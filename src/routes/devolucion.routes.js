const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { listar, crear } = require('../controllers/devolucion.controller');
const { proteger } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

router.use(proteger);

router.get('/', listar);

router.post(
  '/',
  [
    body('fecha').isDate().withMessage('fecha invalida'),
    body('cantidad').isFloat({ gt: 0 }).withMessage('cantidad debe ser mayor a 0'),
  ],
  validar,
  crear
);

module.exports = router;
