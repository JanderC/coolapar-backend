const { PagoProductor, Productor, SemanaPago } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const pagoService = require('../services/pago.service');

// @desc  Listar liquidaciones de pago
// @route GET /api/pagos-productores?semana_id=&productor_id=
const listar = asyncHandler(async (req, res) => {
  const { semana_id, productor_id } = req.query;
  const where = {};
  if (semana_id) where.semana_id = semana_id;
  if (productor_id) where.productor_id = productor_id;

  const pagos = await PagoProductor.findAll({
    where,
    include: [
      { model: Productor, attributes: ['id', 'nombre', 'color_identificativo'] },
      { model: SemanaPago, attributes: ['id', 'fecha_inicio', 'fecha_fin', 'estado'] },
    ],
    order: [['created_at', 'DESC']],
  });

  res.json({ success: true, data: pagos });
});

// @desc  Generar/recalcular la liquidacion semanal de un productor
//        sumando todos sus registros de leche de esa semana.
// @route POST /api/pagos-productores/generar
const generar = asyncHandler(async (req, res) => {
  const { productor_id, semana_id } = req.body;
  const pago = await pagoService.generarLiquidacionProductor(productor_id, semana_id);
  res.json({ success: true, data: pago });
});

// @desc  Generar la liquidacion de TODOS los productores de una semana (cierre semanal)
// @route POST /api/pagos-productores/generar-semana
const generarSemana = asyncHandler(async (req, res) => {
  const { semana_id } = req.body;
  const liquidaciones = await pagoService.generarLiquidacionesDeSemana(semana_id);
  res.json({ success: true, data: liquidaciones });
});

// @desc  Marcar una liquidacion como pagada
// @route PUT /api/pagos-productores/:id/pagar
const marcarPagado = asyncHandler(async (req, res) => {
  const pago = await PagoProductor.findByPk(req.params.id);
  if (!pago) {
    return res.status(404).json({ success: false, message: 'Liquidacion no encontrada.' });
  }

  const { fecha_pago } = req.body;
  await pago.update({ estado_pago: 'pagado', fecha_pago: fecha_pago || new Date() });

  res.json({ success: true, data: pago });
});

module.exports = { listar, generar, generarSemana, marcarPagado };
