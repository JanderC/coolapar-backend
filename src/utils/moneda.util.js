// Monedas soportadas por el sistema.
// Para agregar una moneda nueva en el futuro, solo hay que añadirla aqui
// y en el CHECK constraint de la tabla configuracion_sistema (ver migracion).
const MONEDAS = {
  BOB: { codigo: 'BOB', simbolo: 'Bs.', nombre: 'Bolívares' },
  USD: { codigo: 'USD', simbolo: '$', nombre: 'Dólares' },
  COP: { codigo: 'COP', simbolo: 'COL$', nombre: 'Pesos colombianos' },
};

const CODIGOS_VALIDOS = Object.keys(MONEDAS);

const esMonedaValida = (codigo) => CODIGOS_VALIDOS.includes(codigo);

// Formatea un monto numerico con el simbolo de la moneda dada.
// Ej: formatearMonto(1500.5, 'BOB') -> "Bs. 1.500,50"
const formatearMonto = (monto, codigoMoneda = 'BOB') => {
  const moneda = MONEDAS[codigoMoneda] || MONEDAS.BOB;
  const numero = Number(monto || 0);
  const formateado = numero.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${moneda.simbolo} ${formateado}`;
};

module.exports = { MONEDAS, CODIGOS_VALIDOS, esMonedaValida, formatearMonto };
