const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const {
  obtenerHoja,
  guardarHoja,
  registrarPago,
  historial,
  cambiarEstadoSemana,
  limpiarSemanasVacias,
  eliminarSemana,
  listar,
  eliminar,
} = require('../controllers/registroLeche.controller');
const { proteger, permitirRoles } = require('../middlewares/auth.middleware');
const validar = require('../middlewares/validate.middleware');

const MONEDAS = ['BS', 'USD', 'COP'];

router.use(proteger);

// La hoja se pide de tres formas:
//   - semana_id: reabrir una semana del historial, tal cual quedó guardada.
//   - fecha_inicio + fecha_fin: rango exacto (lo usa la impresión, para
//     traer el mismo tramo de días de varios productores).
//   - fecha_inicio + dia_fin: lo que arma la pantalla al elegir fechas.
router.get(
  '/hoja',
  [
    query('productor_id').isInt().withMessage('Seleccione un productor'),
    query('dia_inicio').optional().isInt({ min: 0, max: 6 }).withMessage('Día de inicio inválido'),
    query('dia_fin').optional().isInt({ min: 0, max: 6 }).withMessage('Día de cierre inválido'),
    query('fecha_inicio').optional().isISO8601().withMessage('Fecha de inicio inválida'),
    query('fecha_fin').optional().isISO8601().withMessage('Fecha de cierre inválida'),
    query('semana_id').optional().isInt(),
  ],
  validar,
  obtenerHoja
);

router.post(
  '/hoja',
  [
    body('productor_id').isInt().withMessage('Seleccione un productor'),
    // O bien semana_id (editar una guardada), o bien fecha_inicio + dia_fin
    // (crear/actualizar). El controlador valida la combinación exacta.
    body('semana_id').optional({ nullable: true }).isInt().withMessage('Semana inválida'),
    body('fecha_inicio').optional({ nullable: true }).isISO8601().withMessage('Fecha de inicio inválida'),
    body('dia_inicio').optional({ nullable: true }).isInt({ min: 0, max: 6 }).withMessage('Día de inicio inválido'),
    body('dia_fin').optional({ nullable: true }).isInt({ min: 0, max: 6 }).withMessage('Día de cierre inválido'),
    body('precio_litro').isFloat({ gt: 0 }).withMessage('El precio por litro debe ser mayor a 0'),
    body('precio_litro_acida')
      .optional({ nullable: true })
      .isFloat({ min: 0 })
      .withMessage('El precio de la leche ácida debe ser mayor o igual a 0'),
    body('precio_litro_bajo_grasa')
      .optional({ nullable: true })
      .isFloat({ min: 0 })
      .withMessage('El precio de la leche baja en grasa debe ser mayor o igual a 0'),
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

router.get(
  '/historial',
  [
    query('productor_id').isInt(),
    query('pagina').optional().isInt({ min: 1 }),
    query('por_pagina').optional().isInt({ min: 1, max: 50 }),
  ],
  validar,
  historial
);

router.patch('/semanas/:id/estado', [param('id').isInt()], validar, cambiarEstadoSemana);

// '/semanas/vacias' va ANTES de '/semanas/:id': si no, Express intenta
// leer "vacias" como un id.
router.delete(
  '/semanas/vacias',
  permitirRoles('admin', 'contabilidad'),
  [query('productor_id').optional().isInt()],
  validar,
  limpiarSemanasVacias
);

router.delete(
  '/semanas/:id',
  permitirRoles('admin', 'contabilidad'),
  [param('id').isInt(), query('forzar').optional().isIn(['true', 'false'])],
  validar,
  eliminarSemana
);

router.get('/', listar);
router.delete('/:id', permitirRoles('admin', 'contabilidad'), [param('id').isInt()], validar, eliminar);

module.exports = router;