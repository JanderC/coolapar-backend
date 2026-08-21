const db = require('../models');
const { TasaCambio } = db;

class ErrorDeNegocio extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.esErrorDeNegocio = true;
  }
}

/**
 * Solo existe una fila de tasas vigentes: no se guarda histórico.
 * Se toma siempre la más reciente por id.
 */
const obtenerVigente = async () => {
  return TasaCambio.findOne({ order: [['id', 'DESC']] });
};

/**
 * Crea o actualiza la fila única de tasas. Como no hay histórico, si ya
 * existe una fila se actualiza esa misma; si no, se crea la primera.
 */
const actualizar = async (datos, usuarioId) => {
  const usd_a_cop = Number(datos.usd_a_cop);
  const usd_a_bs = Number(datos.usd_a_bs);
  const bs_a_cop = Number(datos.bs_a_cop);

  if (!(usd_a_cop > 0)) throw new ErrorDeNegocio('La tasa USD → COP debe ser un número mayor a cero.');
  if (!(usd_a_bs > 0)) throw new ErrorDeNegocio('La tasa USD → BS debe ser un número mayor a cero.');
  if (!(bs_a_cop > 0)) throw new ErrorDeNegocio('La tasa BS → COP debe ser un número mayor a cero.');

  const valores = { usd_a_cop, usd_a_bs, bs_a_cop, actualizado_por: usuarioId || null };

  const existente = await obtenerVigente();
  if (existente) {
    await existente.update(valores);
    return existente;
  }
  return TasaCambio.create(valores);
};

/**
 * Convierte un monto entre dos monedas usando la tasa vigente.
 * Si origen y destino son iguales, devuelve el monto tal cual.
 */
const convertir = (monto, monedaOrigen, monedaDestino, tasas) => {
  const de = String(monedaOrigen || '').toUpperCase();
  const a = String(monedaDestino || '').toUpperCase();
  const valor = Number(monto || 0);

  if (de === a) return valor;
  if (!tasas) throw new ErrorDeNegocio('No hay tasas de cambio configuradas.');

  const { usd_a_cop, usd_a_bs, bs_a_cop } = tasas;

  const rutas = {
    'USD->COP': valor * Number(usd_a_cop),
    'COP->USD': valor / Number(usd_a_cop),
    'USD->BS': valor * Number(usd_a_bs),
    'BS->USD': valor / Number(usd_a_bs),
    'BS->COP': valor * Number(bs_a_cop),
    'COP->BS': valor / Number(bs_a_cop),
  };

  const clave = `${de}->${a}`;
  if (!(clave in rutas)) throw new ErrorDeNegocio(`No se puede convertir de ${de} a ${a}.`);

  return Number(rutas[clave].toFixed(4));
};

module.exports = { ErrorDeNegocio, obtenerVigente, actualizar, convertir };
