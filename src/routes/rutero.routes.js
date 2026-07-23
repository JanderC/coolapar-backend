const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
  obtenerHoja,
  guardarHoja,
  registrarPago,
  historial,
  listarPagos,
} = require('../controllers/rutero.controller');
const { proteger, permitirRoles } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

const MONEDAS = ['BS', 'USD', 'COP'];

const reglasRutero = (esCreacion) => [
  esCreacion
    ? body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio')
    : body('nombre').optional().trim().notEmpty().withMessage('El nombre no puede quedar vacío'),
  body('precio_litro')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0))
    .withMessage('El precio por litro debe ser un número mayor o igual a 0'),
  body('moneda')
    .optional({ nullable: true })
    .customSanitizer((v) => (v ? String(v).toUpperCase() : v))
    .isIn(MONEDAS)
    .withMessage(`Moneda inválida. Use: ${MONEDAS.join(', ')}`),
  body('telefono').optional({ nullable: true }).isLength({ max: 30 }).withMessage('Teléfono demasiado largo'),
];

router.use(proteger);

// Rutas específicas antes de '/:id'
router.get(
  '/hoja',
  [
    query('rutero_id').isInt().withMessage('Seleccione un rutero'),
    query('dia_inicio').optional().isInt({ min: 0, max: 6 }).withMessage('Día de inicio inválido'),
    query('dia_fin').optional().isInt({ min: 0, max: 6 }).withMessage('Día de cierre inválido'),
    query('semana_id').optional().isInt(),
  ],
  validar,
  obtenerHoja
);

router.post(
  '/hoja',
  [
    body('rutero_id').isInt().withMessage('Seleccione un rutero'),
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
  [body('rutero_id').isInt(), body('semana_id').isInt()],
  validar,
  registrarPago
);

router.get('/historial', [query('rutero_id').isInt()], validar, historial);
router.get('/pagos', listarPagos);

router.get('/', listar);
router.get('/:id', [param('id').isInt()], validar, obtener);
router.post('/', reglasRutero(true), validar, crear);
router.put('/:id', [param('id').isInt(), ...reglasRutero(false)], validar, actualizar);
router.delete('/:id', permitirRoles('admin'), [param('id').isInt()], validar, eliminar);

module.exports = router;