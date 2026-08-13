const { Op } = require('sequelize');
const db = require('../models');
const { MovimientoCaja, Empleado } = db;
const { ErrorDeNegocio } = require('./insumos.service');

const CANDIDATOS = {
  monto: ['monto', 'total', 'monto_pagado', 'total_pagado', 'monto_total', 'total_pagar', 'importe'],
  fecha: ['fecha_pago', 'fecha', 'fecha_registro'],
  moneda: ['moneda'],
  estado: ['estado_pago', 'estado'],
};

/** Primer atributo del modelo que exista, de una lista de candidatos. */
const primerCampo = (Modelo, candidatos) => {
  if (!Modelo || !Modelo.rawAttributes) return null;
  return candidatos.find((c) => Object.prototype.hasOwnProperty.call(Modelo.rawAttributes, c)) || null;
};

/** Descripcion de una fuente derivada, resuelta una sola vez al arrancar. */
const describirFuente = (Modelo, { categoria, campoPersona, ModeloPersona }) => {
  if (!Modelo) return null;
  const campos = {
    monto: primerCampo(Modelo, CANDIDATOS.monto),
    fecha: primerCampo(Modelo, CANDIDATOS.fecha),
    moneda: primerCampo(Modelo, CANDIDATOS.moneda),
    estado: primerCampo(Modelo, CANDIDATOS.estado),
  };
  // Sin monto o sin fecha no hay nada util que mostrar en el libro.
  if (!campos.monto || !campos.fecha) return null;
  return { Modelo, categoria, campos, campoPersona, ModeloPersona };
};

const FUENTES_DERIVADAS = [
  describirFuente(db.PagoProductor, {
    categoria: 'pago_productor',
    campoPersona: 'productor_id',
    ModeloPersona: db.Productor,
  }),
  describirFuente(db.PagoRutero, {
    categoria: 'pago_rutero',
    campoPersona: primerCampo(db.PagoRutero, ['transportador_id', 'rutero_id']),
    ModeloPersona: db.Transportador,
  }),
].filter(Boolean);

const redondear = (n) => Number(Number(n || 0).toFixed(2));

const ETIQUETAS = MovimientoCaja.ETIQUETAS;

/** Lee una fuente derivada y la traduce al formato del libro. */
const leerDerivados = async (fuente, { desde, hasta }) => {
  const { Modelo, categoria, campos, campoPersona, ModeloPersona } = fuente;

  const where = {};
  if (desde && hasta) where[campos.fecha] = { [Op.between]: [desde, hasta] };
  // Solo lo efectivamente pagado: un pago pendiente todavia no movio plata.
  if (campos.estado) where[campos.estado] = 'pagado';

  let filas = [];
  try {
    filas = await Modelo.findAll({ where, order: [[campos.fecha, 'DESC']], limit: 500 });
  } catch {
    // Si la tabla no existe todavia, el libro sigue funcionando sin ella.
    return [];
  }

  // Los nombres se traen de una vez, no uno por consulta.
  let nombres = new Map();
  if (campoPersona && ModeloPersona) {
    const ids = [...new Set(filas.map((f) => f[campoPersona]).filter(Boolean))];
    if (ids.length > 0) {
      const personas = await ModeloPersona.findAll({ where: { id: ids }, attributes: ['id', 'nombre'] });
      nombres = new Map(personas.map((p) => [Number(p.id), p.nombre]));
    }
  }

  return filas
    .filter((f) => Number(f[campos.monto]) > 0)
    .map((f) => {
      const persona = campoPersona ? nombres.get(Number(f[campoPersona])) : null;
      return {
        // Clave unica que no choca con la de movimientos_caja.
        id: `${categoria}-${f.id}`,
        origen_id: f.id,
        derivado: true,
        fecha: f[campos.fecha],
        tipo: 'egreso',
        categoria,
        etiqueta_categoria: ETIQUETAS[categoria] || categoria,
        concepto: persona ? `Pago a ${persona}` : ETIQUETAS[categoria],
        contraparte: persona || null,
        monto: redondear(f[campos.monto]),
        moneda: campos.moneda ? f[campos.moneda] || 'BS' : 'BS',
        metodo_pago: null,
        referencia: null,
        anulado: false,
      };
    });
};

/** Movimientos cargados en este modulo, en el formato del libro. */
const leerPropios = async ({ desde, hasta, categoria, moneda }) => {
  const where = {};
  if (desde && hasta) where.fecha = { [Op.between]: [desde, hasta] };
  if (categoria) where.categoria = categoria;
  if (moneda) where.moneda = moneda;

  const filas = await MovimientoCaja.findAll({
    where,
    include: Empleado ? [{ model: Empleado, as: 'Empleado', required: false, attributes: ['id', 'nombre'] }] : [],
    order: [
      ['fecha', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: 500,
  });

  return filas.map((m) => {
    const plano = m.toJSON();
    return {
      ...plano,
      derivado: false,
      etiqueta_categoria: ETIQUETAS[plano.categoria] || plano.categoria,
      contraparte: plano.contraparte || plano.Empleado?.nombre || null,
      monto: redondear(plano.monto),
    };
  });
};

/**
 * El libro completo: lo propio + lo derivado, ordenado por fecha.
 * Los totales van SIEMPRE separados por moneda; BS y USD no se suman.
 */
const libro = async ({ fecha_inicio, fecha_fin, categoria, moneda, incluir_derivados = true } = {}) => {
  const desde = fecha_inicio || null;
  const hasta = fecha_fin || null;

  const propios = await leerPropios({ desde, hasta, categoria, moneda });

  let derivados = [];
  if (incluir_derivados && (!categoria || ['pago_productor', 'pago_rutero'].includes(categoria))) {
    const lotes = await Promise.all(
      FUENTES_DERIVADAS.filter((f) => !categoria || f.categoria === categoria).map((f) =>
        leerDerivados(f, { desde, hasta })
      )
    );
    derivados = lotes.flat();
    if (moneda) derivados = derivados.filter((d) => d.moneda === moneda);
  }

  const movimientos = [...propios, ...derivados].sort((a, b) => {
    if (a.fecha === b.fecha) return String(b.id).localeCompare(String(a.id));
    return String(b.fecha).localeCompare(String(a.fecha));
  });

  // ---- Totales ----
  const porMoneda = new Map();
  const porCategoria = new Map();

  movimientos
    .filter((m) => !m.anulado)
    .forEach((m) => {
      if (!porMoneda.has(m.moneda)) {
        porMoneda.set(m.moneda, { moneda: m.moneda, ingresos: 0, egresos: 0, saldo: 0, movimientos: 0 });
      }
      const t = porMoneda.get(m.moneda);
      t.movimientos += 1;
      if (m.tipo === 'ingreso') t.ingresos += m.monto;
      else t.egresos += m.monto;
      t.saldo = redondear(t.ingresos - t.egresos);

      const clave = `${m.categoria}|${m.moneda}`;
      if (!porCategoria.has(clave)) {
        porCategoria.set(clave, {
          categoria: m.categoria,
          etiqueta: m.etiqueta_categoria,
          tipo: m.tipo,
          moneda: m.moneda,
          total: 0,
          movimientos: 0,
        });
      }
      const c = porCategoria.get(clave);
      c.total = redondear(c.total + m.monto);
      c.movimientos += 1;
    });

  const totales = [...porMoneda.values()].map((t) => ({
    ...t,
    ingresos: redondear(t.ingresos),
    egresos: redondear(t.egresos),
    saldo: redondear(t.ingresos - t.egresos),
  }));

  return {
    rango: { fecha_inicio: desde, fecha_fin: hasta },
    movimientos,
    totales_por_moneda: totales.sort((a, b) => a.moneda.localeCompare(b.moneda)),
    totales_por_categoria: [...porCategoria.values()].sort(
      (a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria)
    ),
    // Para que la pantalla pueda avisar si una fuente no se pudo leer.
    fuentes_derivadas: FUENTES_DERIVADAS.map((f) => f.categoria),
  };
};

/** Registra un movimiento cargado a mano. */
const registrarMovimiento = async (datos, { transaction } = {}) => {
  const tipo = datos.tipo === 'ingreso' ? 'ingreso' : 'egreso';
  const categoria = String(datos.categoria || '').trim();
  const monto = Number(datos.monto);

  const permitidas = tipo === 'ingreso' ? MovimientoCaja.CATEGORIAS_INGRESO : MovimientoCaja.CATEGORIAS_EGRESO;
  if (!permitidas.includes(categoria)) {
    throw new ErrorDeNegocio(`Esa categoría no corresponde a un ${tipo}. Use: ${permitidas.join(', ')}.`);
  }
  if (Number.isNaN(monto) || monto <= 0) throw new ErrorDeNegocio('El monto debe ser mayor a 0.');
  if (!String(datos.concepto || '').trim()) throw new ErrorDeNegocio('Escriba de qué se trata el movimiento.');

  return MovimientoCaja.create(
    {
      fecha: datos.fecha || undefined,
      tipo,
      categoria,
      concepto: String(datos.concepto).trim(),
      monto: redondear(monto),
      moneda: String(datos.moneda || 'BS').toUpperCase(),
      metodo_pago: datos.metodo_pago || null,
      referencia: datos.referencia || null,
      contraparte: datos.contraparte ? String(datos.contraparte).trim() : null,
      empleado_id: datos.empleado_id || null,
      pago_nomina_id: datos.pago_nomina_id || null,
      notas: datos.notas || null,
    },
    { transaction }
  );
};

/**
 * Anula un movimiento. No se borra: deja de sumar pero sigue en el libro,
 * porque un libro contable al que le desaparecen renglones no sirve para
 * cuadrar nada.
 */
const anularMovimiento = async (id, motivo) => {
  const movimiento = await MovimientoCaja.findByPk(id);
  if (!movimiento) throw new ErrorDeNegocio('El movimiento no existe.');
  if (movimiento.anulado) throw new ErrorDeNegocio('Ese movimiento ya estaba anulado.');

  if (movimiento.categoria === 'adelanto' && movimiento.descontado_en_id) {
    throw new ErrorDeNegocio(
      `No se puede anular: este adelanto ya se descontó en el recibo #${movimiento.descontado_en_id}. Anule primero el recibo.`
    );
  }
  if (movimiento.categoria === 'nomina' && movimiento.pago_nomina_id) {
    throw new ErrorDeNegocio(
      `Este movimiento salió del recibo de nómina #${movimiento.pago_nomina_id}. Anule el recibo y este renglón se anula solo.`
    );
  }

  await movimiento.update({
    anulado: true,
    motivo_anulacion: motivo ? String(motivo).trim() : 'Anulado manualmente',
  });
  return movimiento;
};

module.exports = {
  libro,
  registrarMovimiento,
  anularMovimiento,
  ETIQUETAS,
};
