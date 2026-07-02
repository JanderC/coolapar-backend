const { Recibido, RecibidoDetalle, Transportador, Productor, sequelize } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// @desc  Listar recibidos con su detalle por productor
// @route GET /api/recibidos?desde=&hasta=
const listar = asyncHandler(async (req, res) => {
  const recibidos = await Recibido.findAll({
    include: [
      { model: Transportador, attributes: ['id', 'nombre'] },
      {
        model: RecibidoDetalle,
        include: [{ model: Productor, attributes: ['id', 'nombre', 'color_identificativo'] }],
      },
    ],
    order: [['fecha', 'DESC']],
  });

  res.json({ success: true, data: recibidos });
});

// @desc  Obtener un recibido por id con su detalle
// @route GET /api/recibidos/:id
const obtener = asyncHandler(async (req, res) => {
  const recibido = await Recibido.findByPk(req.params.id, {
    include: [
      { model: Transportador, attributes: ['id', 'nombre'] },
      {
        model: RecibidoDetalle,
        include: [{ model: Productor, attributes: ['id', 'nombre', 'color_identificativo'] }],
      },
    ],
  });

  if (!recibido) {
    return res.status(404).json({ success: false, message: 'Recibido no encontrado.' });
  }

  res.json({ success: true, data: recibido });
});

// @desc  Registrar un recibido (litros traidos por el rutero) junto con el
//        detalle/pruebas de cuanto aporto cada productor.
//        body: { transportador_id, fecha, litros_traidos, litros_descartados,
//                motivo_descarte, observaciones, detalle: [{ productor_id, litros_aportados, resultado_prueba }] }
// @route POST /api/recibidos
const crear = asyncHandler(async (req, res) => {
  const {
    transportador_id,
    fecha,
    litros_traidos,
    litros_descartados,
    motivo_descarte,
    observaciones,
    detalle,
  } = req.body;

  const resultado = await sequelize.transaction(async (t) => {
    const recibido = await Recibido.create(
      {
        transportador_id,
        fecha,
        litros_traidos,
        litros_descartados: litros_descartados || 0,
        motivo_descarte,
        observaciones,
      },
      { transaction: t }
    );

    if (Array.isArray(detalle) && detalle.length > 0) {
      const filasDetalle = detalle.map((d) => ({
        recibido_id: recibido.id,
        productor_id: d.productor_id,
        litros_aportados: d.litros_aportados,
        resultado_prueba: d.resultado_prueba,
        observaciones: d.observaciones,
      }));

      await RecibidoDetalle.bulkCreate(filasDetalle, { transaction: t });
    }

    return recibido;
  });

  const recibidoCompleto = await Recibido.findByPk(resultado.id, {
    include: [{ model: RecibidoDetalle }],
  });

  res.status(201).json({ success: true, data: recibidoCompleto });
});

// @desc  Actualizar datos generales de un recibido
// @route PUT /api/recibidos/:id
const actualizar = asyncHandler(async (req, res) => {
  const recibido = await Recibido.findByPk(req.params.id);
  if (!recibido) {
    return res.status(404).json({ success: false, message: 'Recibido no encontrado.' });
  }

  const { litros_traidos, litros_descartados, motivo_descarte, observaciones } = req.body;
  await recibido.update({ litros_traidos, litros_descartados, motivo_descarte, observaciones });

  res.json({ success: true, data: recibido });
});

module.exports = { listar, obtener, crear, actualizar };
