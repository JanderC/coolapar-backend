const MONEDAS = ['BS', 'USD', 'COP'];
const MAX_DIAS_SEMANA = 31;

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const vacio = (v) => v === undefined || v === null || v === '';

/** 'YYYY-MM-DD' sin depender de la zona horaria del servidor. */
const aTexto = (fecha) => {
  const d = fecha instanceof Date ? fecha : new Date(`${fecha}T00:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const esFechaValida = (texto) => /^\d{4}-\d{2}-\d{2}$/.test(String(texto || ''));

/** Lista de días entre dos fechas, ambas incluidas. */
const rangoFechas = (inicio, fin) => {
  const dias = [];
  const cursor = new Date(`${aTexto(inicio)}T00:00:00`);
  const limite = new Date(`${aTexto(fin)}T00:00:00`);
  while (cursor <= limite && dias.length < MAX_DIAS_SEMANA) {
    dias.push(aTexto(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
};

const nombreDia = (fechaTexto) => DIAS[new Date(`${fechaTexto}T00:00:00`).getDay()];

const aNumero = (valor, porDefecto = 0) => {
  if (vacio(valor)) return porDefecto;
  const n = Number(valor);
  return Number.isNaN(n) ? porDefecto : n;
};

const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const normalizarMoneda = (valor, porDefecto = 'BS') => {
  const m = String(valor || porDefecto).toUpperCase();
  return MONEDAS.includes(m) ? m : porDefecto;
};

module.exports = {
  MONEDAS,
  MAX_DIAS_SEMANA,
  DIAS,
  vacio,
  aTexto,
  esFechaValida,
  rangoFechas,
  nombreDia,
  aNumero,
  redondear,
  normalizarMoneda,
};
