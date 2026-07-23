const MONEDAS = ['BS', 'USD', 'COP'];
const MAX_DIAS_SEMANA = 31;

// Mismo orden que getDay() de JavaScript: 0 = domingo.
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

const diaSemana = (fechaTexto) => new Date(`${fechaTexto}T00:00:00`).getDay();

const nombreDia = (fechaTexto) => DIAS[diaSemana(fechaTexto)];

const esDiaValido = (n) => Number.isInteger(Number(n)) && Number(n) >= 0 && Number(n) <= 6;

/** Cuántos días dura el ciclo. Lunes a miércoles = 3; lunes a domingo = 7. */
const largoCiclo = (dia_inicio, dia_fin) => ((Number(dia_fin) - Number(dia_inicio) + 7) % 7) + 1;

/** Última vez que cayó ese día de la semana, contando hoy. */
const ultimaOcurrencia = (dia, referencia = new Date()) => {
  const base = referencia instanceof Date ? new Date(referencia) : new Date(`${referencia}T00:00:00`);
  const atras = (base.getDay() - Number(dia) + 7) % 7;
  base.setDate(base.getDate() - atras);
  return aTexto(base);
};

const sumarDias = (fechaTexto, cantidad) => {
  const d = new Date(`${fechaTexto}T00:00:00`);
  d.setDate(d.getDate() + cantidad);
  return aTexto(d);
};

/** Fechas reales del ciclo en curso para un par de días de la semana. */
const cicloVigente = (dia_inicio, dia_fin, referencia = new Date()) => {
  const fecha_inicio = ultimaOcurrencia(dia_inicio, referencia);
  const fecha_fin = sumarDias(fecha_inicio, largoCiclo(dia_inicio, dia_fin) - 1);
  return { fecha_inicio, fecha_fin };
};

const etiquetaDias = (dia_inicio, dia_fin) => {
  if (!esDiaValido(dia_inicio) || !esDiaValido(dia_fin)) return '';
  return Number(dia_inicio) === Number(dia_fin)
    ? DIAS[Number(dia_inicio)]
    : `${DIAS[Number(dia_inicio)]} a ${DIAS[Number(dia_fin)]}`;
};

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
  diaSemana,
  nombreDia,
  esDiaValido,
  largoCiclo,
  ultimaOcurrencia,
  sumarDias,
  cicloVigente,
  etiquetaDias,
  aNumero,
  redondear,
  normalizarMoneda,
};