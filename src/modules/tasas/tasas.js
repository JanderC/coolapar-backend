const express = require('express');
const { body } = require('express-validator');

const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');
const tasasService = require('../../services/tasas.service');

const router = express.Router();

const conErroresDeNegocio = (manejador) =>
  asyncHandler(async (req, res, next) => {
    try {
      await manejador(req, res, next);
    } catch (err) {
      if (err.esErrorDeNegocio) return res.status(400).json({ success: false, message: err.message });
      throw err;
    }
  });

// @desc  Tasa vigente. La necesita cualquier pantalla que calcule precios,
//        no solo el administrador.
// @route GET /api/tasas
const obtener = asyncHandler(async (req, res) => {
  const tasa = await tasasService.obtenerVigente();

  if (!tasa) {
    return res.json({
      success: true,
      message: 'Aún no se han configurado las tasas de cambio.',
      data: null,
    });
  }

  res.json({ success: true, data: tasa });
});

// @desc  Configurar/actualizar la tasa vigente.
// @route PUT /api/tasas
const actualizar = conErroresDeNegocio(async (req, res) => {
  const tasa = await tasasService.actualizar(req.body, req.usuario?.id);
  res.json({ success: true, message: 'Tasas actualizadas.', data: tasa });
});

const reglasTasas = [
  body('usd_a_cop').isFloat({ gt: 0 }).withMessage('La tasa USD → COP debe ser un número mayor a cero.'),
  body('usd_a_bs').isFloat({ gt: 0 }).withMessage('La tasa USD → BS debe ser un número mayor a cero.'),
  body('bs_a_cop').isFloat({ gt: 0 }).withMessage('La tasa BS → COP debe ser un número mayor a cero.'),
];

router.use(proteger);

router.get('/', obtener);
router.put('/', permitirRoles('admin'), reglasTasas, validar, actualizar);

module.exports = router;
