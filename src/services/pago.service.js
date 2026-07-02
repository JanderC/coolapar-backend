const { RegistroLecheProductor, PagoProductor, FleteTransportador } = require('../models');

/**
 * Calcula el total de litros y el total a pagar de un productor
 * dentro de una semana especifica, sumando todos sus registros diarios.
 */
const calcularLiquidacionProductor = async (productorId, semanaId) => {
  const registros = await RegistroLecheProductor.findAll({
    where: { productor_id: productorId, semana_id: semanaId },
  });

  const total_litros = registros.reduce((acc, r) => acc + parseFloat(r.litros), 0);
  const total_pagar = registros.reduce(
    (acc, r) => acc + parseFloat(r.subtotal ?? r.litros * r.precio_litro),
    0
  );

  return {
    total_litros: Number(total_litros.toFixed(2)),
    total_pagar: Number(total_pagar.toFixed(2)),
  };
};

/**
 * Genera o actualiza la liquidacion (pago) de un productor para una semana.
 */
const generarLiquidacionProductor = async (productorId, semanaId) => {
  const { total_litros, total_pagar } = await calcularLiquidacionProductor(productorId, semanaId);

  const [pago, creado] = await PagoProductor.findOrCreate({
    where: { productor_id: productorId, semana_id: semanaId },
    defaults: { total_litros, total_pagar },
  });

  if (!creado) {
    await pago.update({ total_litros, total_pagar });
  }

  return pago;
};

/**
 * Genera las liquidaciones de TODOS los productores que tengan registros
 * en una semana especifica. Util para cerrar la semana de una sola vez.
 */
const generarLiquidacionesDeSemana = async (semanaId) => {
  const registros = await RegistroLecheProductor.findAll({
    where: { semana_id: semanaId },
    attributes: ['productor_id'],
    group: ['productor_id'],
  });

  const productorIds = registros.map((r) => r.productor_id);
  const liquidaciones = [];

  for (const productorId of productorIds) {
    const pago = await generarLiquidacionProductor(productorId, semanaId);
    liquidaciones.push(pago);
  }

  return liquidaciones;
};

/**
 * Calcula el monto neto a pagar a un transportador en una fecha,
 * descontando los adelantos que se le hayan dado.
 */
const calcularNetoFlete = (montoFlete, adelanto) => {
  const flete = parseFloat(montoFlete) || 0;
  const adel = parseFloat(adelanto) || 0;
  return Number((flete - adel).toFixed(2));
};

/**
 * Suma el total de fletes netos pagados a un transportador en un rango de fechas.
 */
const calcularTotalFletesTransportador = async (transportadorId, fechaInicio, fechaFin) => {
  const { Op } = require('sequelize');

  const fletes = await FleteTransportador.findAll({
    where: {
      transportador_id: transportadorId,
      fecha: { [Op.between]: [fechaInicio, fechaFin] },
    },
  });

  const total = fletes.reduce(
    (acc, f) => acc + calcularNetoFlete(f.monto_flete, f.adelanto),
    0
  );

  return Number(total.toFixed(2));
};

module.exports = {
  calcularLiquidacionProductor,
  generarLiquidacionProductor,
  generarLiquidacionesDeSemana,
  calcularNetoFlete,
  calcularTotalFletesTransportador,
};
