const { PiezaQueso, HistorialPesoPieza, CuartoFrio } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// @desc  Listar piezas de queso (filtrable por cuarto frio)
// @route GET /api/piezas-queso?cuarto_frio_id=
const listar = asyncHandler(async (req, res) => {
  const { cuarto_frio_id } = req.query;
  const where = {};
  if (cuarto_frio_id) where.cuarto_frio_id = cuarto_frio_id;

  const piezas = await PiezaQueso.findAll({
    where,
    include: [{ model: HistorialPesoPieza }],
    order: [['fecha_registro', 'DESC']],
  });

  res.json({ success: true, data: piezas });
});

// @desc  Registrar una pieza individual con su peso inicial
// @route POST /api/piezas-queso
const crear = asyncHandler(async (req, res) => {
  const { cuarto_frio_id, numero_pieza, peso_inicial, fecha_registro } = req.body;

  const cuartoFrio = await CuartoFrio.findByPk(cuarto_frio_id);
  if (!cuartoFrio) {
    return res.status(404).json({ success: false, message: 'Registro de cuarto frio no encontrado.' });
  }

  const pieza = await PiezaQueso.create({
    cuarto_frio_id,
    numero_pieza,
    peso_inicial,
    fecha_registro,
  });

  res.status(201).json({ success: true, data: pieza });
});

// @desc  Registrar una nueva pesada de una pieza (historial de peso)
//        y actualiza el peso_final de la pieza con el ultimo valor.
// @route POST /api/piezas-queso/:id/pesar
const registrarPeso = asyncHandler(async (req, res) => {
  const pieza = await PiezaQueso.findByPk(req.params.id);
  if (!pieza) {
    return res.status(404).json({ success: false, message: 'Pieza no encontrada.' });
  }

  const { fecha, peso } = req.body;

  const registroHistorial = await HistorialPesoPieza.create({
    pieza_id: pieza.id,
    fecha,
    peso,
  });

  await pieza.update({ peso_final: peso });

  res.status(201).json({ success: true, data: registroHistorial });
});

module.exports = { listar, crear, registrarPeso };
