// Monedas soportadas por el sistema.
// Para agregar una moneda nueva en el futuro, solo hay que añadirla aqui
// y en el CHECK constraint de las tablas configuracion_sistema y productores.
const MONEDAS = {
  BS: { codigo: 'BS', simbolo: 'Bs.', nombre: 'Bolívares' },
  USD: { codigo: 'USD', simbolo: '$', nombre: 'Dólares' },
  COP: { codigo: 'COP', simbolo: 'COL$', nombre: 'Pesos colombianos' },
};

const CODIGOS_VALIDOS = Object.keys(MONEDAS);

const esMonedaValida = (codigo) => CODIGOS_VALIDOS.includes(codigo);

// Formatea un monto numerico con el simbolo de la moneda dada.
// Ej: formatearMonto(1500.5, 'BS') -> "Bs. 1.500,50"
const formatearMonto = (monto, codigoMoneda = 'BS') => {
  const moneda = MONEDAS[codigoMoneda] || MONEDAS.BS;
  const numero = Number(monto || 0);
  const formateado = numero.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${moneda.simbolo} ${formateado}`;
};

module.exports = { MONEDAS, CODIGOS_VALIDOS, esMonedaValida, formatearMonto };