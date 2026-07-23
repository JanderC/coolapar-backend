const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const {
  obtenerHoja,
  guardarHoja,
  registrarPago,
  historial,
  cambiarEstadoSemana,
  listar,
  eliminar,
} = require('../controllers/registroLeche.controller');
const { proteger, permitirRoles } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

const MONEDAS = ['BS', 'USD', 'COP'];

router.use(proteger);

// La hoja se pide por días de la semana (dia_inicio/dia_fin) o por semana_id
// cuando se reabre una del historial.
router.get(
  '/hoja',
  [
    query('productor_id').isInt().withMessage('Seleccione un productor'),
    query('dia_inicio').optional().isInt({ min: 0, max: 6 }).withMessage('Día de inicio inválido'),
    query('dia_fin').optional().isInt({ min: 0, max: 6 }).withMessage('Día de cierre inválido'),
    query('fecha_inicio').optional().isISO8601().withMessage('Fecha de inicio inválida'),
    query('semana_id').optional().isInt(),
  ],
  validar,
  obtenerHoja
);

router.post(
  '/hoja',
  [
    body('productor_id').isInt().withMessage('Seleccione un productor'),
    body('semana_id').isInt().withMessage('Falta la semana'),
    body('precio_litro').isFloat({ gt: 0 }).withMessage('El precio por litro debe ser mayor a 0'),
    body('moneda').optional().customSanitizer((v) => String(v || '').toUpperCase()).isIn(MONEDAS),
    body('dias').isArray({ min: 1 }).withMessage('Faltan los días de la semana'),
  ],
  validar,
  guardarHoja
);

router.post(
  '/hoja/pago',
  permitirRoles('admin', 'contabilidad'),
  [body('productor_id').isInt(), body('semana_id').isInt()],
  validar,
  registrarPago
);

router.get('/historial', [query('productor_id').isInt()], validar, historial);

router.patch('/semanas/:id/estado', [param('id').isInt()], validar, cambiarEstadoSemana);

router.get('/', listar);
router.delete('/:id', permitirRoles('admin', 'contabilidad'), [param('id').isInt()], validar, eliminar);

module.exports = router;