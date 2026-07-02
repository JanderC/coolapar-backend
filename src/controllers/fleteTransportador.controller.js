const { FleteTransportador, Transportador } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// @desc  Listar fletes (filtrable por transportador)
// @route GET /api/fletes?transportador_id=
const listar = asyncHandler(async (req, res) => {
  const { transportador_id } = req.query;
  const where = {};
  if (transportador_id) where.transportador_id = transportador_id;

  const fletes = await FleteTransportador.findAll({
    where,
    include: [{ model: Transportador, attributes: ['id', 'nombre'] }],
    order: [['fecha', 'DESC']],
  });

  res.json({ success: true, data: fletes });
});

// @desc  Registrar el flete diario de un transportador (con adelantos si aplica)
// @route POST /api/fletes
const crear = asyncHandler(async (req, res) => {
  const { transportador_id, fecha, monto_flete, adelanto, observaciones } = req.body;

  const transportador = await Transportador.findByPk(transportador_id);
  if (!transportador) {
    return res.status(404).json({ success: false, message: 'Transportador no encontrado.' });
  }

  const flete = await FleteTransportador.create({
    transportador_id,
    fecha,
    monto_flete: monto_flete ?? transportador.tarifa_flete_diario,
    adelanto: adelanto || 0,
    observaciones,
  });

  res.status(201).json({ success: true, data: flete });
});

// @desc  Actualizar un flete (ej. agregar un adelanto)
// @route PUT /api/fletes/:id
const actualizar = asyncHandler(async (req, res) => {
  const flete = await FleteTransportador.findByPk(req.params.id);
  if (!flete) {
    return res.status(404).json({ success: false, message: 'Flete no encontrado.' });
  }

  await flete.update(req.body);
  res.json({ success: true, data: flete });
});

module.exports = { listar, crear, actualizar };
