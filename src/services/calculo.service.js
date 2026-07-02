const { Insumo, UsoInsumo } = require('../models');
const { Op } = require('sequelize');

/**
 * Calcula el porcentaje litro/kilo de un lote de produccion.
 * Aunque la base de datos ya lo calcula automaticamente (columna GENERATED),
 * esta funcion sirve para mostrar el calculo en el frontend antes de guardar,
 * o para validaciones previas.
 */
const calcularPorcentajeLitroKilo = (litrosUtilizados, kilosObtenidos) => {
  const litros = parseFloat(litrosUtilizados);
  const kilos = parseFloat(kilosObtenidos);

  if (!kilos || kilos <= 0) return 0;
  return Number((litros / kilos).toFixed(4));
};

/**
 * Calcula cuanto de cada insumo (ej: sal) se debe usar segun los litros
 * de leche utilizados en un lote de produccion.
 * cantidad_a_gastar = litros_utilizados * factor_por_litro del insumo
 *
 * Devuelve un arreglo listo para insertar en uso_insumos.
 */
const calcularUsoInsumos = async (litrosUtilizados, loteProduccionId, transaction) => {
  const litros = parseFloat(litrosUtilizados);

  const insumos = await Insumo.findAll({
    where: { factor_por_litro: { [Op.ne]: null } },
    transaction,
  });

  return insumos.map((insumo) => ({
    lote_produccion_id: loteProduccionId,
    insumo_id: insumo.id,
    cantidad_calculada: Number((litros * parseFloat(insumo.factor_por_litro)).toFixed(4)),
  }));
};

/**
 * Registra en la base de datos el uso de insumos calculado para un lote.
 */
const registrarUsoInsumos = async (litrosUtilizados, loteProduccionId, transaction) => {
  const usos = await calcularUsoInsumos(litrosUtilizados, loteProduccionId, transaction);
  if (usos.length > 0) {
    await UsoInsumo.bulkCreate(usos, { transaction });
  }
  return usos;
};

/**
 * Calcula la perdida de peso de una pieza o lote en cuarto frio.
 */
const calcularPerdidaPeso = (pesoInicial, pesoFinal) => {
  const inicial = parseFloat(pesoInicial);
  const final = pesoFinal !== null && pesoFinal !== undefined ? parseFloat(pesoFinal) : inicial;
  return Number((inicial - final).toFixed(3));
};

module.exports = {
  calcularPorcentajeLitroKilo,
  calcularUsoInsumos,
  registrarUsoInsumos,
  calcularPerdidaPeso,
};
