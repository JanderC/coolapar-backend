const { Op } = require('sequelize');
const { Empleado, PagoNomina, MovimientoCaja, Prestamo, sequelize } = require('../models');
const { ErrorDeNegocio } = require('./insumos.service');

/**
 * Nomina: recibos de pago de los empleados y adelantos a cuenta.
 *
 * Un adelanto NO es una tabla aparte: es un egreso del libro de caja con
 * categoria 'adelanto'. Al armar el recibo, los adelantos pendientes de
 * ese empleado se marcan contra el recibo (descontado_en_id) y se restan
 * del neto. Como quedan marcados, es imposible descontarlos dos veces.
 */

const redondear = (n) => Number(Number(n || 0).toFixed(2));
const aNumero = (v, porDefecto = 0) => {
  const n = Number(v);
  return Number.isNaN(n) ? porDefecto : n;
};

/** Adelantos entregados y todavia no descontados en ningun recibo. */
const adelantosPendientes = async (empleadoId, { hasta = null, transaction = null } = {}) => {
  const where = {
    empleado_id: empleadoId,
    categoria: 'adelanto',
    anulado: false,
    descontado_en_id: null,
  };
  if (hasta) where.fecha = { [Op.lte]: hasta };

  return MovimientoCaja.findAll({
    where,
    order: [['fecha', 'ASC']],
    transaction,
  });
};

/**
 * Lo que se le debe a un empleado si se le hiciera el recibo hoy.
 * Sirve para mostrar el resumen antes de guardar nada.
 */
const previsualizar = async (empleadoId, { periodo_fin = null } = {}) => {
  const empleado = await Empleado.findByPk(empleadoId);
  if (!empleado) throw new ErrorDeNegocio('El empleado no existe.');

  const adelantos = await adelantosPendientes(empleadoId, { hasta: periodo_fin });
  const totalAdelantos = redondear(adelantos.reduce((s, a) => s + Number(a.monto), 0));
  const sueldo = redondear(empleado.sueldo);

  // Los prestamos se INFORMAN pero no se descuentan: la persona los va
  // cancelando aparte. Mezclarlos con el sueldo seria justo lo contrario
  // de lo que se pidio.
  let prestamosAbiertos = [];
  if (Prestamo) {
    const abiertos = await Prestamo.findAll({
      where: { empleado_id: empleadoId, estado: 'abierto' },
    });
    const abonos = await MovimientoCaja.findAll({
      where: { prestamo_id: abiertos.map((p) => p.id), categoria: 'abono_prestamo', anulado: false },
      attributes: ['prestamo_id', 'monto'],
    });
    prestamosAbiertos = abiertos.map((p) => {
      const pagado = abonos
        .filter((a) => a.prestamo_id === p.id)
        .reduce((s, a) => s + Number(a.monto), 0);
      return {
        id: p.id,
        fecha: p.fecha,
        monto: redondear(p.monto),
        moneda: p.moneda,
        saldo: redondear(Number(p.monto) - pagado),
        motivo: p.motivo,
      };
    });
  }

  return {
    empleado: {
      id: empleado.id,
      nombre: empleado.nombre,
      cargo: empleado.cargo,
      sueldo,
      moneda: empleado.moneda,
      frecuencia_pago: empleado.frecuencia_pago,
    },
    adelantos: adelantos.map((a) => ({
      id: a.id,
      fecha: a.fecha,
      monto: redondear(a.monto),
      moneda: a.moneda,
      concepto: a.concepto,
    })),
    total_adelantos: totalAdelantos,
    neto_estimado: redondear(sueldo - totalAdelantos),
    // Solo informativo: NO entra en el neto.
    prestamos_abiertos: prestamosAbiertos,
    // Aviso util: un adelanto en otra moneda no se puede restar del
    // sueldo sin una tasa, asi que se deja fuera y se avisa.
    adelantos_en_otra_moneda: adelantos
      .filter((a) => a.moneda !== empleado.moneda)
      .map((a) => ({ id: a.id, monto: redondear(a.monto), moneda: a.moneda })),
  };
};

/**
 * Crea el recibo. Si viene estado 'pagado', ademas anota el egreso en el
 * libro de caja. Todo en una transaccion: o queda el recibo con su
 * renglon y sus adelantos marcados, o no queda nada.
 */
const crearRecibo = async (datos) => {
  const empleado = await Empleado.findByPk(datos.empleado_id);
  if (!empleado) throw new ErrorDeNegocio('El empleado no existe.');
  if (!empleado.activo) throw new ErrorDeNegocio(`${empleado.nombre} está archivado.`);

  const periodoInicio = datos.periodo_inicio;
  const periodoFin = datos.periodo_fin;
  if (!periodoInicio || !periodoFin) throw new ErrorDeNegocio('Indique el período que se está pagando.');
  if (periodoInicio > periodoFin) throw new ErrorDeNegocio('El período empieza después de terminar.');

  const moneda = String(datos.moneda || empleado.moneda || 'BS').toUpperCase();
  const sueldoBase = redondear(aNumero(datos.sueldo_base, aNumero(empleado.sueldo)));
  const asignaciones = redondear(aNumero(datos.otras_asignaciones));
  const deducciones = redondear(aNumero(datos.otras_deducciones));

  if (sueldoBase < 0 || asignaciones < 0 || deducciones < 0) {
    throw new ErrorDeNegocio('Los importes no pueden ser negativos.');
  }

  return sequelize.transaction(async (transaction) => {
    // Solo se descuentan los adelantos en la MISMA moneda del recibo:
    // restar dolares de un sueldo en bolivares necesitaria una tasa, y
    // esa decision no le toca al sistema.
    const pendientes = (await adelantosPendientes(empleado.id, { hasta: periodoFin, transaction })).filter(
      (a) => a.moneda === moneda
    );

    // Se puede acotar cuales descontar; si no se indica, van todos.
    const idsElegidos = Array.isArray(datos.adelantos_ids) ? datos.adelantos_ids.map(Number) : null;
    const adelantos = idsElegidos ? pendientes.filter((a) => idsElegidos.includes(a.id)) : pendientes;

    const totalAdelantos = redondear(adelantos.reduce((s, a) => s + Number(a.monto), 0));
    const neto = redondear(sueldoBase + asignaciones - totalAdelantos - deducciones);

    if (neto < 0) {
      throw new ErrorDeNegocio(
        `El neto queda en negativo (${neto}). Los adelantos y deducciones superan el sueldo: descuente menos adelantos en este recibo.`
      );
    }

    const estado = datos.estado === 'pagado' ? 'pagado' : 'borrador';

    const recibo = await PagoNomina.create(
      {
        empleado_id: empleado.id,
        fecha: datos.fecha || undefined,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        sueldo_base: sueldoBase,
        otras_asignaciones: asignaciones,
        total_adelantos: totalAdelantos,
        otras_deducciones: deducciones,
        neto,
        moneda,
        metodo_pago: datos.metodo_pago || null,
        referencia: datos.referencia || null,
        notas: datos.notas || null,
        estado,
      },
      { transaction }
    );

    // Los adelantos quedan marcados contra este recibo: ya no vuelven a
    // aparecer como pendientes.
    if (adelantos.length > 0) {
      await MovimientoCaja.update(
        { descontado_en_id: recibo.id },
        { where: { id: adelantos.map((a) => a.id) }, transaction }
      );
    }

    if (estado === 'pagado') {
      await anotarEnCaja(recibo, empleado, transaction);
    }

    return recibo;
  });
};

/** Renglon del libro de caja por el neto entregado. */
const anotarEnCaja = async (recibo, empleado, transaction) => {
  if (Number(recibo.neto) <= 0) return null;
  return MovimientoCaja.create(
    {
      fecha: recibo.fecha,
      tipo: 'egreso',
      categoria: 'nomina',
      concepto: `Nómina de ${empleado.nombre} (${recibo.periodo_inicio} al ${recibo.periodo_fin})`,
      monto: recibo.neto,
      moneda: recibo.moneda,
      metodo_pago: recibo.metodo_pago,
      referencia: recibo.referencia,
      contraparte: empleado.nombre,
      empleado_id: empleado.id,
      pago_nomina_id: recibo.id,
    },
    { transaction }
  );
};

/** Pasa un borrador a pagado y lo anota en el libro. */
const marcarPagado = async (reciboId, datos = {}) => {
  return sequelize.transaction(async (transaction) => {
    const recibo = await PagoNomina.findByPk(reciboId, { transaction });
    if (!recibo) throw new ErrorDeNegocio('El recibo no existe.');
    if (recibo.anulado) throw new ErrorDeNegocio('Ese recibo está anulado.');
    if (recibo.estado === 'pagado') throw new ErrorDeNegocio('Ese recibo ya estaba pagado.');

    const empleado = await Empleado.findByPk(recibo.empleado_id, { transaction });

    await recibo.update(
      {
        estado: 'pagado',
        fecha: datos.fecha || recibo.fecha,
        metodo_pago: datos.metodo_pago || recibo.metodo_pago,
        referencia: datos.referencia || recibo.referencia,
      },
      { transaction }
    );

    await anotarEnCaja(recibo, empleado, transaction);
    return recibo;
  });
};

/**
 * Anula un recibo: suelta sus adelantos (vuelven a quedar pendientes) y
 * anula su renglon en el libro. El recibo no se borra.
 */
const anularRecibo = async (reciboId, motivo) => {
  return sequelize.transaction(async (transaction) => {
    const recibo = await PagoNomina.findByPk(reciboId, { transaction });
    if (!recibo) throw new ErrorDeNegocio('El recibo no existe.');
    if (recibo.anulado) throw new ErrorDeNegocio('Ese recibo ya estaba anulado.');

    // Los adelantos vuelven a estar pendientes para el proximo recibo.
    await MovimientoCaja.update(
      { descontado_en_id: null },
      { where: { descontado_en_id: recibo.id, categoria: 'adelanto' }, transaction }
    );

    // Y el egreso deja de contar en el libro.
    await MovimientoCaja.update(
      { anulado: true, motivo_anulacion: `Recibo #${recibo.id} anulado` },
      { where: { pago_nomina_id: recibo.id, categoria: 'nomina', anulado: false }, transaction }
    );

    await recibo.update(
      { anulado: true, motivo_anulacion: motivo ? String(motivo).trim() : 'Anulado manualmente' },
      { transaction }
    );

    return recibo;
  });
};

/** Registra un adelanto: sale plata hoy, se descuenta en el próximo recibo. */
const registrarAdelanto = async (datos) => {
  const empleado = await Empleado.findByPk(datos.empleado_id);
  if (!empleado) throw new ErrorDeNegocio('El empleado no existe.');
  if (!empleado.activo) throw new ErrorDeNegocio(`${empleado.nombre} está archivado.`);

  const monto = Number(datos.monto);
  if (Number.isNaN(monto) || monto <= 0) throw new ErrorDeNegocio('El monto del adelanto debe ser mayor a 0.');

  const moneda = String(datos.moneda || empleado.moneda || 'BS').toUpperCase();

  return MovimientoCaja.create({
    fecha: datos.fecha || undefined,
    tipo: 'egreso',
    categoria: 'adelanto',
    concepto: datos.concepto ? String(datos.concepto).trim() : `Adelanto a ${empleado.nombre}`,
    monto: redondear(monto),
    moneda,
    metodo_pago: datos.metodo_pago || null,
    referencia: datos.referencia || null,
    contraparte: empleado.nombre,
    empleado_id: empleado.id,
    notas: datos.notas || null,
  });
};

module.exports = {
  adelantosPendientes,
  previsualizar,
  crearRecibo,
  marcarPagado,
  anularRecibo,
  registrarAdelanto,
};