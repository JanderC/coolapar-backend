// Espejo en el frontend de la lógica de conversión de
// src/services/tasas.service.js (backend). Se mantiene aquí, simple y sin
// llamar al servidor en cada tecla, para poder auto-completar precios al
// vuelo mientras se arma una venta.

/**
 * Convierte un monto entre monedas usando las tasas vigentes.
 * @param {number} monto
 * @param {string} monedaOrigen
 * @param {string} monedaDestino
 * @param {{usd_a_cop:number, usd_a_bs:number, bs_a_cop:number}|null} tasas
 * @returns {number|null} el monto convertido, o null si no se puede convertir
 *   (falta esa tasa, o no hay tasas configuradas).
 */
export const convertirMonto = (monto, monedaOrigen, monedaDestino, tasas) => {
  const de = String(monedaOrigen || '').toUpperCase();
  const a = String(monedaDestino || '').toUpperCase();
  const valor = Number(monto);

  if (Number.isNaN(valor)) return null;
  if (de === a) return valor;
  if (!tasas) return null;

  const usdCop = Number(tasas.usd_a_cop);
  const usdBs = Number(tasas.usd_a_bs);
  const bsCop = Number(tasas.bs_a_cop);

  const rutas = {
    'USD->COP': usdCop > 0 ? valor * usdCop : null,
    'COP->USD': usdCop > 0 ? valor / usdCop : null,
    'USD->BS': usdBs > 0 ? valor * usdBs : null,
    'BS->USD': usdBs > 0 ? valor / usdBs : null,
    'BS->COP': bsCop > 0 ? valor * bsCop : null,
    'COP->BS': bsCop > 0 ? valor / bsCop : null,
  };

  const resultado = rutas[`${de}->${a}`];
  return resultado === null || resultado === undefined || Number.isNaN(resultado)
    ? null
    : Number(resultado.toFixed(4));
};
