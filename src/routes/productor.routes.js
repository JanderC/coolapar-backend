const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const {
  listar,
  nivelesPrecio,
  obtener,
  crear,
  actualizar,
  colorPorPrecio,
  eliminar,
} = require('../controllers/productor.controller');
const { proteger, permitirRoles } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

const MONEDAS = ['BS', 'USD', 'COP'];
const HEX = /^#[0-9A-Fa-f]{6}$/;

// Reglas compartidas entre POST y PUT.
// El color YA NO es obligatorio ni único: identifica el nivel de precio
// de la leche, así que se puede repetir entre productores.
const reglasProductor = (esCreacion) => [
  esCreacion
    ? body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio')
    : body('nombre').optional().trim().notEmpty().withMessage('El nombre no puede quedar vacío'),

  body('ruta_id')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || Number.isInteger(Number(v)))
    .withMessage('Ruta inválida'),

  body('color_identificativo')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || HEX.test(v))
    .withMessage('El color debe ser hexadecimal, ej: #FF5733'),

  body('moneda')
    .optional({ nullable: true })
    .customSanitizer((v) => (v ? String(v).toUpperCase() : v))
    .isIn(MONEDAS)
    .withMessage(`Moneda inválida. Use: ${MONEDAS.join(', ')}`),

  body('precio_litro_base')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0))
    .withMessage('El precio por litro debe ser un número mayor o igual a 0'),

  body('precio_litro_acida')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0))
    .withMessage('El precio de la leche ácida debe ser un número mayor o igual a 0'),

  body('precio_litro_bajo_grasa')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0))
    .withMessage('El precio de la leche baja en grasa debe ser un número mayor o igual a 0'),

  body('telefono').optional({ nullable: true }).isLength({ max: 30 }).withMessage('Teléfono demasiado largo'),
  body('direccion').optional({ nullable: true }).isLength({ max: 255 }).withMessage('Dirección demasiado larga'),
];

router.use(proteger);

router.get(
  '/',
  [query('activo').optional().isIn(['true', 'false']), query('ruta_id').optional().isInt()],
  validar,
  listar
);

// Debe ir ANTES de '/:id' o Express lo tomaría como un id.
router.get('/niveles-precio', nivelesPrecio);

router.get('/:id', [param('id').isInt().withMessage('Id inválido')], validar, obtener);

router.post('/', reglasProductor(true), validar, crear);

router.put('/:id', [param('id').isInt().withMessage('Id inválido'), ...reglasProductor(false)], validar, actualizar);

router.patch(
  '/color-por-precio',
  permitirRoles('admin', 'contabilidad'),
  [
    body('moneda').customSanitizer((v) => String(v || '').toUpperCase()).isIn(MONEDAS),
    body('precio_litro_base').custom((v) => !Number.isNaN(Number(v)) && Number(v) >= 0),
    body('color_identificativo').matches(HEX).withMessage('Color hexadecimal inválido'),
  ],
  validar,
  colorPorPrecio
);

router.delete('/:id', permitirRoles('admin'), [param('id').isInt()], validar, eliminar);

module.exports = router;