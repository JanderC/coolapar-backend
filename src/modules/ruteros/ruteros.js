const express = require('express');
const { body, param, query } = require('express-validator');
const { Op } = require('sequelize');

const db = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');
const {
  MONEDAS,
  vacio,
  aTexto,
  esFechaValida,
  rangoFechas,
  nombreDia,
  diaSemana,
  esDiaValido,
  cicloVigente,
  largoCiclo,
  sumarDias,
  etiquetaDias,
  aNumero,
  redondear,
  normalizarMoneda,
} = require('../../utils/semanas');

const router = express.Router();

// "Rutero" en pantalla = modelo Transportador (tabla transportadores).
const { Transportador: Rutero, RegistroLecheRutero, PagoRutero, SemanaPago } = db;

// ============================================================
//  CRUD DE RUTEROS
// ============================================================

const normalizarCampos = (body = {}) => {
  const datos = {};
  if (body.nombre !== undefined) datos.nombre = String(body.nombre).trim();
  if (body.telefono !== undefined) datos.telefono = vacio(body.telefono) ? null : String(body.telefono).trim();
  if (body.precio_litro !== undefined) datos.precio_litro = aNumero(body.precio_litro, NaN);
  if (body.moneda !== undefined) datos.moneda = normalizarMoneda(body.moneda, 'COP');
  if (body.tarifa_flete_diario !== undefined) datos.tarifa_flete_diario = aNumero(body.tarifa_flete_diario, 0);
  if (body.activo !== undefined) datos.activo = body.activo === true || body.activo === 'true';
  return datos;
};

const validarDatos = (datos, { esCreacion }) => {
  if (esCreacion && !datos.nombre) return 'El nombre del rutero es obligatorio.';
  if (datos.nombre !== undefined && !datos.nombre) return 'El nombre del rutero es obligatorio.';
  if (datos.precio_litro !== undefined && (Number.isNaN(datos.precio_litro) || datos.precio_litro < 0)) {
    return 'El precio por litro debe ser un número mayor o igual a 0.';
  }
  if (datos.moneda !== undefined && !MONEDAS.includes(datos.moneda)) {
    return `Moneda inválida. Use: ${MONEDAS.join(', ')}.`;
  }
  return null;
};

const listar = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.activo !== undefined) where.activo = req.query.activo === 'true';

  const ruteros = await Rutero.findAll({ where, order: [['nombre', 'ASC']] });
  res.json({ success: true, data: ruteros });
});

const obtener = asyncHandler(async (req, res) => {
  const rutero = await Rutero.findByPk(req.params.id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });
  res.json({ success: true, data: rutero });
});

const crear = asyncHandler(async (req, res) => {
  const datos = normalizarCampos(req.body);
  if (datos.moneda === undefined) datos.moneda = 'COP';
  if (datos.precio_litro === undefined) datos.precio_litro = 0;

  const error = validarDatos(datos, { esCreacion: true });
  if (error) return res.status(400).json({ success: false, message: error });

  const rutero = await Rutero.create(datos);
  res.status(201).json({ success: true, data: rutero });
});

const actualizar = asyncHandler(async (req, res) => {
  const rutero = await Rutero.findByPk(req.params.id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });

  const datos = normalizarCampos(req.body);
  const error = validarDatos(datos, { esCreacion: false });
  if (error) return res.status(400).json({ success: false, message: error });

  await rutero.update(datos);
  res.json({ success: true, data: rutero });
});

const eliminar = asyncHandler(async (req, res) => {
  const rutero = await Rutero.findByPk(req.params.id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });

  await rutero.update({ activo: false });
  res.json({ success: true, message: 'Rutero desactivado.' });
});

// ============================================================
//  HOJA SEMANAL DEL RUTERO
//  Mismos días de la semana que el productor: se eligen por nombre.
// ============================================================

const resolverSemana = async (rutero, { semana_id, dia_inicio, dia_fin, fecha_inicio }) => {
  if (!vacio(semana_id)) {
    const semana = await SemanaPago.findByPk(semana_id);
    if (!semana) throw Object.assign(new Error('Semana no encontrada.'), { status: 404 });
    if (semana.rutero_id && Number(semana.rutero_id) !== Number(rutero.id)) {
      throw Object.assign(new Error('Esa semana pertenece a otro rutero.'), { status: 400 });
    }
    return semana;
  }

  if (!esDiaValido(dia_fin)) {
    throw Object.assign(new Error('Indique el día en que termina la semana.'), { status: 400 });
  }
  const fin = Number(dia_fin);

  let inicio;
  let fechaInicioTexto;
  let fechaFinTexto;

  if (!vacio(fecha_inicio)) {
    if (!esFechaValida(fecha_inicio)) {
      throw Object.assign(new Error('La fecha de inicio no es válida.'), { status: 400 });
    }
    fechaInicioTexto = fecha_inicio;
    inicio = diaSemana(fechaInicioTexto);
    fechaFinTexto = sumarDias(fechaInicioTexto, largoCiclo(inicio, fin) - 1);
  } else {
    if (!esDiaValido(dia_inicio)) {
      throw Object.assign(new Error('Indique el día en que inicia y el día en que termina.'), { status: 400 });
    }
    inicio = Number(dia_inicio);
    ({ fecha_inicio: fechaInicioTexto, fecha_fin: fechaFinTexto } = cicloVigente(inicio, fin));
  }

  const existente = await SemanaPago.findOne({ where: { rutero_id: rutero.id, fecha_inicio: fechaInicioTexto } });

  if (!existente) {
    return SemanaPago.create({
      rutero_id: rutero.id,
      fecha_inicio: fechaInicioTexto,
      fecha_fin: fechaFinTexto,
      dia_inicio: inicio,
      dia_fin: fin,
      estado: 'abierta',
    });
  }

  if (aTexto(existente.fecha_fin) !== fechaFinTexto || Number(existente.dia_fin) !== fin) {
    if (existente.estado === 'cerrada') return existente;

    if (fechaFinTexto < aTexto(existente.fecha_fin)) {
      await RegistroLecheRutero.destroy({
        where: {
          rutero_id: rutero.id,
          fecha: { [Op.gt]: fechaFinTexto, [Op.lte]: aTexto(existente.fecha_fin) },
        },
      });
    }
    await existente.update({ fecha_fin: fechaFinTexto, dia_inicio: inicio, dia_fin: fin });
  }

  return existente;
};

const armarHoja = async (rutero, semana) => {
  const fechas = rangoFechas(semana.fecha_inicio, semana.fecha_fin);

  const registros = await RegistroLecheRutero.findAll({
    where: { rutero_id: rutero.id, fecha: { [Op.between]: [fechas[0], fechas[fechas.length - 1]] } },
    order: [['fecha', 'ASC']],
  });

  const porFecha = new Map(registros.map((r) => [aTexto(r.fecha), r]));

  const dias = fechas.map((fecha) => {
    const r = porFecha.get(fecha);
    return {
      fecha,
      dia: nombreDia(fecha),
      registro_id: r?.id || null,
      litros: r ? Number(r.litros) : null,
      sobrante: r ? Number(r.sobrante) : 0,
      faltante: r ? Number(r.faltante) : 0,
      descripcion: r?.descripcion || '',
    };
  });

  const conDatos = dias.filter((d) => d.litros !== null);
  const total_litros = redondear(conDatos.reduce((s, d) => s + d.litros, 0));
  const total_sobrante = redondear(dias.reduce((s, d) => s + (d.sobrante || 0), 0));
  const total_faltante = redondear(dias.reduce((s, d) => s + (d.faltante || 0), 0));

  const pago = await PagoRutero.findOne({ where: { rutero_id: rutero.id, semana_id: semana.id } });

  const precio_litro = pago ? Number(pago.precio_litro) : Number(rutero.precio_litro || 0);
  const moneda = pago ? pago.moneda : normalizarMoneda(rutero.moneda, 'COP');

  return {
    rutero: {
      id: rutero.id,
      nombre: rutero.nombre,
      telefono: rutero.telefono,
      precio_litro: Number(rutero.precio_litro || 0),
      moneda: rutero.moneda,
    },
    semana: {
      id: semana.id,
      estado: semana.estado,
      dia_inicio: semana.dia_inicio,
      dia_fin: semana.dia_fin,
      etiqueta: etiquetaDias(semana.dia_inicio, semana.dia_fin),
    },
    precio_litro,
    moneda,
    dias,
    totales: {
      dias_con_leche: conDatos.length,
      total_litros,
      total_sobrante,
      total_faltante,
      total_pagar: redondear(total_litros * precio_litro),
    },
    pago,
  };
};

/**
 * Igual que armarHoja, pero para un rango de fechas suelto y SIN semana.
 * Se usa solo para consultar e imprimir.
 */
const armarHojaRango = async (rutero, desde, hasta) => {
  const fechas = rangoFechas(desde, hasta);

  const registros = await RegistroLecheRutero.findAll({
    where: { rutero_id: rutero.id, fecha: { [Op.between]: [desde, hasta] } },
    order: [['fecha', 'ASC']],
  });

  const porFecha = new Map(registros.map((r) => [aTexto(r.fecha), r]));

  const dias = fechas.map((fecha) => {
    const r = porFecha.get(fecha);
    return {
      fecha,
      dia: nombreDia(fecha),
      registro_id: r?.id || null,
      litros: r ? Number(r.litros) : null,
      sobrante: r ? Number(r.sobrante) : 0,
      faltante: r ? Number(r.faltante) : 0,
      descripcion: r?.descripcion || '',
    };
  });

  const conDatos = dias.filter((d) => d.litros !== null);
  const total_litros = redondear(conDatos.reduce((s, d) => s + d.litros, 0));
  const precio_litro = Number(rutero.precio_litro || 0);

  return {
    rutero: {
      id: rutero.id,
      nombre: rutero.nombre,
      telefono: rutero.telefono,
      precio_litro,
      moneda: rutero.moneda,
    },
    semana: null,
    precio_litro,
    moneda: normalizarMoneda(rutero.moneda, 'COP'),
    dias,
    totales: {
      dias_con_leche: conDatos.length,
      total_litros,
      total_sobrante: redondear(dias.reduce((s, d) => s + (d.sobrante || 0), 0)),
      total_faltante: redondear(dias.reduce((s, d) => s + (d.faltante || 0), 0)),
      total_pagar: redondear(total_litros * precio_litro),
    },
    pago: null,
  };
};

/**
 * Hoja de SOLO LECTURA. Existe aparte de /hoja porque aquella pasa por
 * resolverSemana, que CREA o AJUSTA la semana si no existe: imprimir o
 * consultar no puede tener ese efecto.
 *
 * @route GET /api/ruteros/hoja-consulta?rutero_id=&semana_id=
 *        o bien ?rutero_id=&fecha_inicio=&fecha_fin=
 */
const hojaConsulta = asyncHandler(async (req, res) => {
  const rutero = await Rutero.findByPk(req.query.rutero_id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });

  if (!vacio(req.query.semana_id)) {
    const semana = await SemanaPago.findByPk(req.query.semana_id);
    if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });
    if (semana.rutero_id && Number(semana.rutero_id) !== Number(rutero.id)) {
      return res.status(400).json({ success: false, message: 'Esa semana pertenece a otro rutero.' });
    }
    return res.json({ success: true, data: await armarHoja(rutero, semana) });
  }

  const { fecha_inicio, fecha_fin } = req.query;
  if (!esFechaValida(fecha_inicio) || !esFechaValida(fecha_fin)) {
    return res.status(400).json({ success: false, message: 'Indique la semana o un rango de fechas válido.' });
  }
  if (fecha_inicio > fecha_fin) {
    return res.status(400).json({ success: false, message: 'La fecha de inicio debe ser anterior a la de cierre.' });
  }

  res.json({ success: true, data: await armarHojaRango(rutero, fecha_inicio, fecha_fin) });
});

// @route GET /api/ruteros/hoja?rutero_id=&dia_inicio=&dia_fin=  (o &semana_id=)
const obtenerHoja = asyncHandler(async (req, res) => {
  const rutero = await Rutero.findByPk(req.query.rutero_id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });

  try {
    const semana = await resolverSemana(rutero, req.query);
    res.json({ success: true, data: await armarHoja(rutero, semana) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    throw err;
  }
});

// @route POST /api/ruteros/hoja
const guardarHoja = asyncHandler(async (req, res) => {
  const { rutero_id, semana_id, dias } = req.body;
  const precio_litro = aNumero(req.body.precio_litro, NaN);
  const moneda = normalizarMoneda(req.body.moneda, 'COP');

  const rutero = await Rutero.findByPk(rutero_id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });

  const semana = await SemanaPago.findByPk(semana_id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });
  if (semana.rutero_id && Number(semana.rutero_id) !== Number(rutero.id)) {
    return res.status(400).json({ success: false, message: 'Esa semana pertenece a otro rutero.' });
  }
  if (semana.estado === 'cerrada') {
    return res.status(400).json({ success: false, message: 'La semana está cerrada. Reábrala para editarla.' });
  }
  if (Number.isNaN(precio_litro) || precio_litro <= 0) {
    return res.status(400).json({ success: false, message: 'Indique cuánto se le paga al rutero por litro.' });
  }
  if (!Array.isArray(dias) || dias.length === 0) {
    return res.status(400).json({ success: false, message: 'No llegaron los días de la semana.' });
  }

  const validas = new Set(rangoFechas(semana.fecha_inicio, semana.fecha_fin));
  const fuera = dias.find((d) => !validas.has(String(d.fecha)));
  if (fuera) {
    return res.status(400).json({ success: false, message: 'Uno de los días no pertenece a esta semana.' });
  }

  const transaccion = await db.sequelize.transaction();
  try {
    for (const dia of dias) {
      const fecha = String(dia.fecha);
      const litros = vacio(dia.litros) ? null : aNumero(dia.litros, NaN);
      const sobrante = aNumero(dia.sobrante, 0);
      const faltante = aNumero(dia.faltante, 0);
      const descripcion = vacio(dia.descripcion) ? null : String(dia.descripcion).trim();

      const existente = await RegistroLecheRutero.findOne({
        where: { rutero_id: rutero.id, fecha },
        transaction: transaccion,
      });

      const sinNada = (litros === null || litros === 0) && sobrante === 0 && faltante === 0 && !descripcion;
      if (sinNada) {
        if (existente) await existente.destroy({ transaction: transaccion });
        continue;
      }

      if (litros !== null && (Number.isNaN(litros) || litros < 0)) {
        throw Object.assign(new Error(`Litros inválidos en ${nombreDia(fecha)}.`), { status: 400 });
      }

      const valores = {
        litros: litros === null ? 0 : litros,
        sobrante,
        faltante,
        descripcion,
        semana_id: semana.id,
      };

      if (existente) {
        await existente.update(valores, { transaction: transaccion });
      } else {
        await RegistroLecheRutero.create({ rutero_id: rutero.id, fecha, ...valores }, { transaction: transaccion });
      }
    }
    await transaccion.commit();
  } catch (err) {
    await transaccion.rollback();
    if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
    throw err;
  }

  const hoja = await armarHoja(rutero, semana);
  const valoresPago = {
    total_litros: hoja.totales.total_litros,
    precio_litro,
    moneda,
    total_pagar: redondear(hoja.totales.total_litros * precio_litro),
    total_sobrante: hoja.totales.total_sobrante,
    total_faltante: hoja.totales.total_faltante,
  };

  const pagoExistente = await PagoRutero.findOne({ where: { rutero_id: rutero.id, semana_id: semana.id } });
  if (pagoExistente) {
    await pagoExistente.update(valoresPago);
  } else {
    await PagoRutero.create({ rutero_id: rutero.id, semana_id: semana.id, ...valoresPago, estado_pago: 'pendiente' });
  }

  res.json({ success: true, message: 'Semana guardada.', data: await armarHoja(rutero, semana) });
});

// @route POST /api/ruteros/hoja/pago
const registrarPago = asyncHandler(async (req, res) => {
  const marcarPagado = req.body.marcar_pagado !== false;

  const rutero = await Rutero.findByPk(req.body.rutero_id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });

  const semana = await SemanaPago.findByPk(req.body.semana_id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });

  const hoja = await armarHoja(rutero, semana);
  if (hoja.totales.total_litros <= 0) {
    return res.status(400).json({ success: false, message: 'Esta semana no tiene litros cargados.' });
  }
  if (hoja.precio_litro <= 0) {
    return res.status(400).json({ success: false, message: 'Guarde primero la semana con el precio por litro.' });
  }

  const valores = {
    total_litros: hoja.totales.total_litros,
    precio_litro: hoja.precio_litro,
    moneda: hoja.moneda,
    total_pagar: hoja.totales.total_pagar,
    total_sobrante: hoja.totales.total_sobrante,
    total_faltante: hoja.totales.total_faltante,
    estado_pago: marcarPagado ? 'pagado' : 'pendiente',
    fecha_pago: marcarPagado ? aTexto(new Date()) : null,
    observaciones: vacio(req.body.observaciones) ? null : String(req.body.observaciones).trim(),
  };

  const existente = await PagoRutero.findOne({ where: { rutero_id: rutero.id, semana_id: semana.id } });
  const pago = existente
    ? await existente.update(valores)
    : await PagoRutero.create({ rutero_id: rutero.id, semana_id: semana.id, ...valores });

  res.json({ success: true, message: marcarPagado ? 'Pago registrado.' : 'Pago pendiente.', data: pago });
});

// @route GET /api/ruteros/historial?rutero_id=
// ============================================================
//  RESUMEN DE LA SEMANA (todos los ruteros de un rango)
//
//  Va al reves que la hoja: en vez de partir de un rutero y ver su
//  semana, parte del rango y trae a todos los que trajeron leche esos
//  dias, con su litraje dia por dia.
//
//  Es de SOLO LECTURA: no toca semanas_pago.
// ============================================================
const MAX_DIAS_RESUMEN = 92;

// @route GET /api/ruteros/resumen-semana?fecha_inicio=&fecha_fin=
const resumenSemana = asyncHandler(async (req, res) => {
  const desde = aTexto(req.query.fecha_inicio);
  const hasta = aTexto(req.query.fecha_fin);

  if (!esFechaValida(desde) || !esFechaValida(hasta)) {
    return res.status(400).json({ success: false, message: 'Indique la fecha de inicio y la de cierre.' });
  }
  if (desde > hasta) {
    return res.status(400).json({ success: false, message: 'La fecha de inicio debe ser anterior a la de cierre.' });
  }

  const fechas = rangoFechas(desde, hasta);
  if (fechas.length > MAX_DIAS_RESUMEN) {
    return res.status(400).json({
      success: false,
      message: `El rango no puede pasar de ${MAX_DIAS_RESUMEN} días. Consulte por semanas.`,
    });
  }

  const registros = await RegistroLecheRutero.findAll({
    where: { fecha: { [Op.between]: [desde, hasta] } },
    include: [{ model: Rutero, as: 'Rutero', required: false, attributes: ['id', 'nombre', 'precio_litro', 'moneda'] }],
    order: [
      ['rutero_id', 'ASC'],
      ['fecha', 'ASC'],
    ],
  });

  // Columnas de la tabla: todos los dias del rango, traigan leche o no.
  const columnas = fechas.map((f) => ({ fecha: f, dia: nombreDia(f) }));

  const porRutero = new Map();

  registros.forEach((r) => {
    const litros = aNumero(r.litros, 0);
    const sobrante = aNumero(r.sobrante, 0);
    const faltante = aNumero(r.faltante, 0);
    if (litros <= 0 && sobrante <= 0 && faltante <= 0) return;

    const id = Number(r.rutero_id);
    if (!porRutero.has(id)) {
      const t = r.Rutero;
      porRutero.set(id, {
        rutero_id: id,
        nombre: t?.nombre || `Rutero ${id}`,
        precio_litro: aNumero(t?.precio_litro, 0),
        moneda: normalizarMoneda(t?.moneda, 'COP'),
        porFecha: new Map(),
        dias_con_leche: 0,
        total_litros: 0,
        total_sobrante: 0,
        total_faltante: 0,
      });
    }

    const fila = porRutero.get(id);
    const fecha = aTexto(r.fecha);

    fila.dias_con_leche += litros > 0 ? 1 : 0;
    fila.porFecha.set(fecha, {
      fecha,
      dia: nombreDia(fecha),
      litros: redondear(litros),
      sobrante: redondear(sobrante),
      faltante: redondear(faltante),
      descripcion: r.descripcion || '',
    });

    fila.total_litros += litros;
    fila.total_sobrante += sobrante;
    fila.total_faltante += faltante;
  });

  const ruteros = [...porRutero.values()]
    .map((f) => {
      // Se rellenan los dias sin leche para que todas las filas tengan
      // las mismas columnas y la tabla cuadre.
      const dias = columnas.map(
        (c) => f.porFecha.get(c.fecha) || { fecha: c.fecha, dia: c.dia, litros: 0, sobrante: 0, faltante: 0, descripcion: '' }
      );

      return {
        rutero_id: f.rutero_id,
        nombre: f.nombre,
        moneda: f.moneda,
        precio_litro: redondear(f.precio_litro),
        dias,
        dias_con_leche: f.dias_con_leche,
        total_litros: redondear(f.total_litros),
        total_sobrante: redondear(f.total_sobrante),
        total_faltante: redondear(f.total_faltante),
        total_pagar: redondear(f.total_litros * f.precio_litro),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  // Litros recibidos por dia, sumando a todos los ruteros.
  const totalesPorDia = columnas.map((c) => {
    let litros = 0;
    ruteros.forEach((t) => {
      const d = t.dias.find((x) => x.fecha === c.fecha);
      if (d) litros += d.litros;
    });
    return { fecha: c.fecha, dia: c.dia, total_litros: redondear(litros) };
  });

  // El dinero se agrupa por moneda: nunca se suman entre si.
  const porMoneda = new Map();
  ruteros.forEach((t) => {
    if (!porMoneda.has(t.moneda)) {
      porMoneda.set(t.moneda, { moneda: t.moneda, ruteros: 0, total_litros: 0, total_pagar: 0 });
    }
    const acumulado = porMoneda.get(t.moneda);
    acumulado.ruteros += 1;
    acumulado.total_litros = redondear(acumulado.total_litros + t.total_litros);
    acumulado.total_pagar = redondear(acumulado.total_pagar + t.total_pagar);
  });

  res.json({
    success: true,
    data: {
      rango: { fecha_inicio: desde, fecha_fin: hasta, dias: fechas.length, columnas },
      ruteros,
      totales_por_dia: totalesPorDia,
      totales_por_moneda: [...porMoneda.values()].sort((a, b) => a.moneda.localeCompare(b.moneda)),
      totales: {
        ruteros: ruteros.length,
        total_litros: redondear(ruteros.reduce((s, t) => s + t.total_litros, 0)),
        total_sobrante: redondear(ruteros.reduce((s, t) => s + t.total_sobrante, 0)),
        total_faltante: redondear(ruteros.reduce((s, t) => s + t.total_faltante, 0)),
      },
    },
  });
});

// @route GET /api/ruteros/historial?rutero_id=&estado_pago=&fecha_inicio=&fecha_fin=
const historial = asyncHandler(async (req, res) => {
  const rutero = await Rutero.findByPk(req.query.rutero_id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });

  const where = { rutero_id: rutero.id };
  // Acotar por fechas sirve para responder "cuánto se le pagó en agosto".
  if (!vacio(req.query.fecha_inicio) && !vacio(req.query.fecha_fin)) {
    where.fecha_inicio = { [Op.between]: [req.query.fecha_inicio, req.query.fecha_fin] };
  }

  const limite = Math.min(Number(req.query.limite) || 52, 200);

  const semanas = await SemanaPago.findAll({
    where,
    order: [['fecha_inicio', 'DESC']],
    limit: limite,
  });

  const pagos = await PagoRutero.findAll({
    where: { rutero_id: rutero.id, semana_id: semanas.map((s) => s.id) },
  });

  let data = semanas.map((s) => {
    const pago = pagos.find((p) => Number(p.semana_id) === Number(s.id));
    return {
      id: s.id,
      estado: s.estado,
      // Las fechas son lo que permite saber DE QUE semana se habla:
      // "lunes a domingo" solo, no distingue una semana de otra.
      fecha_inicio: s.fecha_inicio,
      fecha_fin: s.fecha_fin,
      dia_inicio: s.dia_inicio,
      dia_fin: s.dia_fin,
      etiqueta: etiquetaDias(s.dia_inicio, s.dia_fin),
      total_litros: pago ? Number(pago.total_litros) : 0,
      total_pagar: pago ? Number(pago.total_pagar) : 0,
      moneda: pago?.moneda || rutero.moneda,
      estado_pago: pago?.estado_pago || null,
      fecha_pago: pago?.fecha_pago || null,
      pagada: pago?.estado_pago === 'pagado',
    };
  });

  // Filtro de "solo las semanas que ya le pagué" (o las que faltan).
  if (req.query.estado_pago === 'pagado') data = data.filter((s) => s.pagada);
  if (req.query.estado_pago === 'pendiente') data = data.filter((s) => !s.pagada);

  // El dinero se agrupa por moneda: nunca se suman entre sí.
  const porMoneda = new Map();
  data
    .filter((s) => s.pagada)
    .forEach((s) => {
      if (!porMoneda.has(s.moneda)) porMoneda.set(s.moneda, { moneda: s.moneda, semanas: 0, total_pagar: 0 });
      const acumulado = porMoneda.get(s.moneda);
      acumulado.semanas += 1;
      acumulado.total_pagar = redondear(acumulado.total_pagar + s.total_pagar);
    });

  res.json({
    success: true,
    data,
    resumen: {
      semanas: data.length,
      semanas_pagadas: data.filter((s) => s.pagada).length,
      total_litros: redondear(data.reduce((acc, s) => acc + s.total_litros, 0)),
      pagado_por_moneda: [...porMoneda.values()].sort((a, b) => a.moneda.localeCompare(b.moneda)),
    },
  });
});

// @route GET /api/ruteros/pagos?semana_id=&rutero_id=
const listarPagos = asyncHandler(async (req, res) => {
  const where = {};
  if (!vacio(req.query.semana_id)) where.semana_id = Number(req.query.semana_id);
  if (!vacio(req.query.rutero_id)) where.rutero_id = Number(req.query.rutero_id);

  const pagos = await PagoRutero.findAll({
    where,
    include: [{ model: Rutero, as: 'Rutero', attributes: ['id', 'nombre'] }],
    order: [['semana_id', 'DESC']],
  });

  res.json({ success: true, data: pagos });
});

// ---------- Rutas ----------
const reglasRutero = (esCreacion) => [
  esCreacion
    ? body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio')
    : body('nombre').optional().trim().notEmpty().withMessage('El nombre no puede quedar vacío'),
  body('precio_litro')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0))
    .withMessage('El precio por litro debe ser un número mayor o igual a 0'),
  body('moneda')
    .optional({ nullable: true })
    .customSanitizer((v) => (v ? String(v).toUpperCase() : v))
    .isIn(MONEDAS)
    .withMessage(`Moneda inválida. Use: ${MONEDAS.join(', ')}`),
  body('telefono').optional({ nullable: true }).isLength({ max: 30 }).withMessage('Teléfono demasiado largo'),
];

router.use(proteger);

// Rutas específicas antes de '/:id'
router.get(
  '/hoja',
  [
    query('rutero_id').isInt().withMessage('Seleccione un rutero'),
    query('dia_inicio').optional().isInt({ min: 0, max: 6 }).withMessage('Día de inicio inválido'),
    query('dia_fin').optional().isInt({ min: 0, max: 6 }).withMessage('Día de cierre inválido'),
    query('fecha_inicio').optional().isISO8601().withMessage('Fecha de inicio inválida'),
    query('semana_id').optional().isInt(),
  ],
  validar,
  obtenerHoja
);

router.post(
  '/hoja',
  [
    body('rutero_id').isInt().withMessage('Seleccione un rutero'),
    body('semana_id').isInt().withMessage('Falta la semana'),
    body('precio_litro').isFloat({ gt: 0 }).withMessage('El precio por litro debe ser mayor a 0'),
    body('moneda').optional().customSanitizer((v) => String(v || '').toUpperCase()).isIn(MONEDAS),
    body('dias').isArray({ min: 1 }).withMessage('Faltan los días de la semana'),
  ],
  validar,
  guardarHoja
);

router.post(
  '/hoja/pago',
  permitirRoles('admin', 'contabilidad'),
  [body('rutero_id').isInt(), body('semana_id').isInt()],
  validar,
  registrarPago
);

router.get('/historial', [query('rutero_id').isInt()], validar, historial);
// Solo lectura: no crea ni modifica semanas. Es la que usa la impresión.
router.get('/hoja-consulta', [query('rutero_id').isInt()], validar, hojaConsulta);
// Todos los ruteros de un rango de fechas, día por día.
router.get(
  '/resumen-semana',
  [query('fecha_inicio').isISO8601(), query('fecha_fin').isISO8601()],
  validar,
  resumenSemana
);
router.get('/pagos', listarPagos);

router.get('/', listar);
router.get('/:id', [param('id').isInt()], validar, obtener);
router.post('/', reglasRutero(true), validar, crear);
router.put('/:id', [param('id').isInt(), ...reglasRutero(false)], validar, actualizar);
router.delete('/:id', permitirRoles('admin'), [param('id').isInt()], validar, eliminar);

module.exports = router;