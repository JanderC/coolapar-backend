const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const {
  listarSemanas,
  abrirSemana,
  cerrarSemana,
  obtenerHoja,
  guardarHoja,
  registrarPago,
  resumenSemana,
  listar,
  crear,
  actualizar,
  eliminar,
} = require('../controllers/registroLeche.controller');
const { proteger, permitirRoles } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

const MONEDAS = ['BS', 'USD', 'COP'];

router.use(proteger);

// ---- Semanas ----
router.get('/semanas', listarSemanas);

router.post(
  '/semanas',
  [
    body('fecha_inicio').isISO8601().withMessage('Fecha de inicio inválida'),
    body('fecha_fin').isISO8601().withMessage('Fecha de cierre inválida'),
  ],
  validar,
  abrirSemana
);

router.patch('/semanas/:id/cerrar', [param('id').isInt()], validar, cerrarSemana);

// ---- Hoja semanal (rutas específicas antes de '/:id') ----
router.get(
  '/hoja',
  [query('productor_id').isInt().withMessage('Seleccione un productor'), query('semana_id').isInt().withMessage('Seleccione una semana')],
  validar,
  obtenerHoja
);

router.post(
  '/hoja',
  [
    body('productor_id').isInt().withMessage('Seleccione un productor'),
    body('semana_id').isInt().withMessage('Seleccione una semana'),
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

router.get('/resumen', [query('semana_id').isInt()], validar, resumenSemana);

// ---- Registros sueltos ----
router.get('/', listar);

router.post(
  '/',
  [
    body('productor_id').isInt().withMessage('productor_id es obligatorio'),
    body('semana_id').isInt().withMessage('semana_id es obligatorio'),
    body('fecha').isISO8601().withMessage('Fecha inválida'),
    body('litros').isFloat({ gt: 0 }).withMessage('Los litros deben ser mayores a 0'),
    body('precio_litro').optional().isFloat({ gt: 0 }).withMessage('Precio por litro inválido'),
    body('moneda').optional().customSanitizer((v) => String(v || '').toUpperCase()).isIn(MONEDAS),
  ],
  validar,
  crear
);

router.put('/:id', [param('id').isInt()], validar, actualizar);
router.delete('/:id', permitirRoles('admin', 'contabilidad'), [param('id').isInt()], validar, eliminar);

module.exports = router;