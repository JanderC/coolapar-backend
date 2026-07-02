const { SemanaPago } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// @desc  Listar semanas de pago
// @route GET /api/semanas-pago
const listar = asyncHandler(async (req, res) => {
  const semanas = await SemanaPago.findAll({ order: [['fecha_inicio', 'DESC']] });
  res.json({ success: true, data: semanas });
});

// @desc  Obtener la semana actualmente abierta
// @route GET /api/semanas-pago/actual
const obtenerActual = asyncHandler(async (req, res) => {
  const semana = await SemanaPago.findOne({ where: { estado: 'abierta' }, order: [['fecha_inicio', 'DESC']] });
  if (!semana) {
    return res.status(404).json({ success: false, message: 'No hay ninguna semana abierta actualmente.' });
  }
  res.json({ success: true, data: semana });
});

// @desc  Abrir una nueva semana de pago (registra fecha de inicio)
// @route POST /api/semanas-pago
const crear = asyncHandler(async (req, res) => {
  const { fecha_inicio } = req.body;

  const semanaAbierta = await SemanaPago.findOne({ where: { estado: 'abierta' } });
  if (semanaAbierta) {
    return res.status(400).json({
      success: false,
      message: 'Ya existe una semana abierta. Ciérrala antes de abrir una nueva.',
    });
  }

  const semana = await SemanaPago.create({ fecha_inicio, estado: 'abierta' });
  res.status(201).json({ success: true, data: semana });
});

// @desc  Cerrar una semana de pago
// @route PUT /api/semanas-pago/:id/cerrar
const cerrar = asyncHandler(async (req, res) => {
  const semana = await SemanaPago.findByPk(req.params.id);
  if (!semana) {
    return res.status(404).json({ success: false, message: 'Semana no encontrada.' });
  }

  const { fecha_fin } = req.body;
  await semana.update({ estado: 'cerrada', fecha_fin: fecha_fin || new Date() });

  res.json({ success: true, data: semana });
});

module.exports = { listar, obtenerActual, crear, cerrar };
