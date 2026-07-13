const { ConfiguracionSistema } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { MONEDAS, esMonedaValida } = require('../utils/moneda.util');

// Obtiene (o crea si no existe) la fila unica de configuracion del sistema
const obtenerConfiguracion = async () => {
  let config = await ConfiguracionSistema.findOne({ order: [['id', 'ASC']] });
  if (!config) {
    config = await ConfiguracionSistema.create({ moneda_actual: 'BS' });
  }
  return config;
};

// @desc  Obtener la configuracion actual del sistema (moneda activa, etc.)
// @route GET /api/configuracion
const obtener = asyncHandler(async (req, res) => {
  const config = await obtenerConfiguracion();
  res.json({
    success: true,
    data: {
      moneda_actual: config.moneda_actual,
      monedas_disponibles: MONEDAS,
    },
  });
});

// @desc  Cambiar la moneda global del sistema (solo admin)
// @route PUT /api/configuracion/moneda
const actualizarMoneda = asyncHandler(async (req, res) => {
  const { moneda } = req.body;

  if (!moneda || !esMonedaValida(moneda)) {
    return res.status(400).json({
      success: false,
      message: `Moneda invalida. Valores permitidos: ${Object.keys(MONEDAS).join(', ')}.`,
    });
  }

  const config = await obtenerConfiguracion();
  await config.update({ moneda_actual: moneda });

  res.json({
    success: true,
    message: 'Moneda del sistema actualizada correctamente.',
    data: { moneda_actual: config.moneda_actual },
  });
});

module.exports = { obtener, actualizarMoneda };