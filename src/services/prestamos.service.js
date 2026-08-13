const { Op } = require('sequelize');
const db = require('../models');
const { Prestamo, MovimientoCaja, Empleado, sequelize } = db;
const { ErrorDeNegocio } = require('./insumos.service');

/**
 * Préstamos a empleados, productores o ruteros.
 *
 * DIFERENCIA IMPORTANTE con un adelanto:
 *   - Adelanto: plata a cuenta del sueldo. Se descuenta solo en el
 *     próximo recibo de nómina.
 *   - Préstamo: la persona lo va cancelando por su cuenta, en abonos.
 *     NUNCA toca el cálculo de la nómina.
 *
 * Por eso son dos cosas separadas y no se pueden confundir: un empleado
 * puede tener un adelanto Y un préstamo al mismo tiempo, y solo el
 * primero le baja el sueldo.
 *
 * El saldo no se guarda en ninguna columna: es monto - abonos, calculado
 * al leer. Un saldo guardado es un saldo que algún día deja de cuadrar
 * con sus propios abonos.
 */

const redondear = (n) => Number(Number(n || 0).toFixed(2));

/** Abonos de uno o varios préstamos, agrupados por préstamo. */
const abonosPorPrestamo = async (ids, transaction = null) => {
  if (!ids || ids.length === 0) return new Map();

  const abonos = await MovimientoCaja.findAll({
    where: { prestamo_id: ids, categoria: 'abono_prestamo', anulado: false },
    order: [['fecha', 'ASC']],
    transaction,
  });

  const mapa = new Map();
  abonos.forEach((a) => {
    const lista = mapa.get(a.prestamo_id) || [];
    lista.push({
      id: a.id,
      fecha: a.fecha,
      monto: redondear(a.monto),
      moneda: a.moneda,
      metodo_pago: a.metodo_pago,
      referencia: a.referencia,
      concepto: a.concepto,
    });
    mapa.set(a.prestamo_id, lista);
  });
  return mapa;
};

/** Le agrega a un préstamo sus abonos y su saldo. */
const conSaldo = (prestamo, abonos = []) => {
  const monto = redondear(prestamo.monto);
  const pagado = redondear(abonos.reduce((s, a) => s + a.monto, 0));
  const saldo = redondear(monto - pagado);
  return {
    ...prestamo.toJSON(),
    monto,
    abonos,
    total_abonado: pagado,
    saldo,
    // Se considera pagado cuando no queda ni un centavo.
    esta_pagado: saldo <= 0.004,
  };
};

const listar = async ({ estado, beneficiario_tipo, empleado_id, productor_id, buscar } = {}) => {
  const where = {};
  if (estado) where.estado = estado;
  if (beneficiario_tipo) where.beneficiario_tipo = beneficiario_tipo;
  if (empleado_id) where.empleado_id = Number(empleado_id);
  if (productor_id) where.productor_id = Number(productor_id);
  if (buscar) where.beneficiario_nombre = { [Op.iLike]: `%${String(buscar).trim()}%` };

  const prestamos = await Prestamo.findAll({
    where,
    order: [
      ['estado', 'ASC'],
      ['fecha', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: 300,
  });

  const abonos = await abonosPorPrestamo(prestamos.map((p) => p.id));
  return prestamos.map((p) => conSaldo(p, abonos.get(p.id) || []));
};

const obtener = async (id) => {
  const prestamo = await Prestamo.findByPk(id);
  if (!prestamo) throw new ErrorDeNegocio('El préstamo no existe.');
  const abonos = await abonosPorPrestamo([prestamo.id]);
  return conSaldo(prestamo, abonos.get(prestamo.id) || []);
};

/** Cuánto debe cada persona, para mostrarlo junto a su ficha. */
const saldosPorBeneficiario = async () => {
  const prestamos = await Prestamo.findAll({ where: { estado: 'abierto' } });
  const abonos = await abonosPorPrestamo(prestamos.map((p) => p.id));

  const mapa = new Map();
  prestamos.forEach((p) => {
    const conDatos = conSaldo(p, abonos.get(p.id) || []);
    if (conDatos.saldo <= 0) return;
    const clave = `${p.beneficiario_tipo}:${p.empleado_id || p.productor_id || p.beneficiario_nombre}`;
    const actual = mapa.get(clave) || {
      beneficiario_tipo: p.beneficiario_tipo,
      empleado_id: p.empleado_id,
      productor_id: p.productor_id,
      nombre: p.beneficiario_nombre,
      saldos: {},
      prestamos: 0,
    };
    actual.saldos[p.moneda] = redondear((actual.saldos[p.moneda] || 0) + conDatos.saldo);
    actual.prestamos += 1;
    mapa.set(clave, actual);
  });

  return [...mapa.values()];
};

/**
 * Entrega un préstamo. Sale la plata hoy (egreso en el libro) y queda
 * el saldo abierto para irse cobrando.
 */
const crear = async (datos) => {
  const tipo = String(datos.beneficiario_tipo || '').trim();
  if (!Prestamo.TIPOS_BENEFICIARIO.includes(tipo)) {
    throw new ErrorDeNegocio(`Indique a quién se le prestó: ${Prestamo.TIPOS_BENEFICIARIO.join(', ')}.`);
  }

  const monto = Number(datos.monto);
  if (Number.isNaN(monto) || monto <= 0) throw new ErrorDeNegocio('El monto del préstamo debe ser mayor a 0.');

  // El nombre se resuelve del registro correspondiente y se congela.
  let nombre = datos.beneficiario_nombre ? String(datos.beneficiario_nombre).trim() : '';
  let empleadoId = null;
  let productorId = null;

  if (tipo === 'empleado') {
    const empleado = await Empleado.findByPk(datos.empleado_id);
    if (!empleado) throw new ErrorDeNegocio('El empleado no existe.');
    empleadoId = empleado.id;
    nombre = empleado.nombre;
  } else if (tipo === 'productor') {
    const productor = db.Productor ? await db.Productor.findByPk(datos.productor_id) : null;
    if (!productor) throw new ErrorDeNegocio('El productor no existe.');
    productorId = productor.id;
    nombre = productor.nombre;
  }

  if (!nombre) throw new ErrorDeNegocio('Indique a quién se le prestó.');

  const moneda = String(datos.moneda || 'BS').toUpperCase();

  return sequelize.transaction(async (transaction) => {
    const prestamo = await Prestamo.create(
      {
        beneficiario_tipo: tipo,
        empleado_id: empleadoId,
        productor_id: productorId,
        beneficiario_nombre: nombre,
        fecha: datos.fecha || undefined,
        monto: redondear(monto),
        moneda,
        motivo: datos.motivo ? String(datos.motivo).trim() : null,
        notas: datos.notas ? String(datos.notas).trim() : null,
        estado: 'abierto',
      },
      { transaction }
    );

    await MovimientoCaja.create(
      {
        fecha: prestamo.fecha,
        tipo: 'egreso',
        categoria: 'prestamo',
        concepto: `Préstamo a ${nombre}${prestamo.motivo ? ` — ${prestamo.motivo}` : ''}`,
        monto: prestamo.monto,
        moneda,
        metodo_pago: datos.metodo_pago || null,
        referencia: datos.referencia || null,
        contraparte: nombre,
        empleado_id: empleadoId,
        prestamo_id: prestamo.id,
      },
      { transaction }
    );

    return prestamo;
  });
};

/** Abono: la persona paga una parte (o todo) de lo que debe. */
const registrarAbono = async (prestamoId, datos) => {
  const monto = Number(datos.monto);
  if (Number.isNaN(monto) || monto <= 0) throw new ErrorDeNegocio('El monto del abono debe ser mayor a 0.');

  return sequelize.transaction(async (transaction) => {
    const prestamo = await Prestamo.findByPk(prestamoId, { transaction });
    if (!prestamo) throw new ErrorDeNegocio('El préstamo no existe.');
    if (prestamo.estado === 'anulado') throw new ErrorDeNegocio('Ese préstamo está anulado.');

    const abonos = await abonosPorPrestamo([prestamo.id], transaction);
    const actual = conSaldo(prestamo, abonos.get(prestamo.id) || []);

    if (monto > actual.saldo + 0.004) {
      throw new ErrorDeNegocio(
        `El abono es mayor que lo que se debe: quedan ${actual.saldo} ${prestamo.moneda} por cancelar.`
      );
    }

    const abono = await MovimientoCaja.create(
      {
        fecha: datos.fecha || undefined,
        tipo: 'ingreso',
        categoria: 'abono_prestamo',
        concepto: `Abono de ${prestamo.beneficiario_nombre} al préstamo #${prestamo.id}`,
        monto: redondear(monto),
        moneda: prestamo.moneda,
        metodo_pago: datos.metodo_pago || null,
        referencia: datos.referencia || null,
        contraparte: prestamo.beneficiario_nombre,
        empleado_id: prestamo.empleado_id,
        prestamo_id: prestamo.id,
        notas: datos.notas || null,
      },
      { transaction }
    );

    // Si con este abono quedó en cero, el préstamo se cierra solo.
    const saldoNuevo = redondear(actual.saldo - monto);
    if (saldoNuevo <= 0.004 && prestamo.estado !== 'pagado') {
      await prestamo.update({ estado: 'pagado' }, { transaction });
    }

    return { abono, saldo: saldoNuevo };
  });
};

/** Anula un préstamo entregado por error. Solo si nadie abonó nada. */
const anular = async (id, motivo) => {
  return sequelize.transaction(async (transaction) => {
    const prestamo = await Prestamo.findByPk(id, { transaction });
    if (!prestamo) throw new ErrorDeNegocio('El préstamo no existe.');
    if (prestamo.estado === 'anulado') throw new ErrorDeNegocio('Ese préstamo ya estaba anulado.');

    const abonos = await abonosPorPrestamo([prestamo.id], transaction);
    const lista = abonos.get(prestamo.id) || [];
    if (lista.length > 0) {
      throw new ErrorDeNegocio(
        `No se puede anular: ya tiene ${lista.length} abono(s) registrado(s). Anule primero los abonos en el libro de caja.`
      );
    }

    await MovimientoCaja.update(
      { anulado: true, motivo_anulacion: `Préstamo #${prestamo.id} anulado` },
      { where: { prestamo_id: prestamo.id, categoria: 'prestamo', anulado: false }, transaction }
    );

    await prestamo.update(
      { estado: 'anulado', motivo_anulacion: motivo ? String(motivo).trim() : 'Anulado manualmente' },
      { transaction }
    );

    return prestamo;
  });
};

module.exports = {
  listar,
  obtener,
  crear,
  registrarAbono,
  anular,
  saldosPorBeneficiario,
};
