const { Op } = require('sequelize');
const db = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const {
  MONEDAS,
  vacio,
  aTexto,
  rangoFechas,
  nombreDia,
  aNumero,
  redondear,
  normalizarMoneda,
} = require('../utils/semanas');

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

// @route GET /api/ruteros?activo=true
const listar = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.activo !== undefined) where.activo = req.query.activo === 'true';

  const ruteros = await Rutero.findAll({ where, order: [['nombre', 'ASC']] });
  res.json({ success: true, data: ruteros });
});

// @route GET /api/ruteros/:id
const obtener = asyncHandler(async (req, res) => {
  const rutero = await Rutero.findByPk(req.params.id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });
  res.json({ success: true, data: rutero });
});

// @route POST /api/ruteros
const crear = asyncHandler(async (req, res) => {
  const datos = normalizarCampos(req.body);
  if (datos.moneda === undefined) datos.moneda = 'COP';
  if (datos.precio_litro === undefined) datos.precio_litro = 0;

  const error = validarDatos(datos, { esCreacion: true });
  if (error) return res.status(400).json({ success: false, message: error });

  const rutero = await Rutero.create(datos);
  res.status(201).json({ success: true, data: rutero });
});

// @route PUT /api/ruteros/:id
const actualizar = asyncHandler(async (req, res) => {
  const rutero = await Rutero.findByPk(req.params.id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });

  const datos = normalizarCampos(req.body);
  const error = validarDatos(datos, { esCreacion: false });
  if (error) return res.status(400).json({ success: false, message: error });

  await rutero.update(datos);
  res.json({ success: true, data: rutero });
});

// @route DELETE /api/ruteros/:id
const eliminar = asyncHandler(async (req, res) => {
  const rutero = await Rutero.findByPk(req.params.id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });

  await rutero.update({ activo: false });
  res.json({ success: true, message: 'Rutero desactivado.' });
});

// ============================================================
//  HOJA SEMANAL DEL RUTERO
//  Litros | Sobrante | Faltante | Descripción, igual que la libreta.
// ============================================================

const armarHoja = async (rutero, semana) => {
  const dias = rangoFechas(semana.fecha_inicio, semana.fecha_fin);

  const registros = await RegistroLecheRutero.findAll({
    where: { rutero_id: rutero.id, fecha: { [Op.between]: [dias[0], dias[dias.length - 1]] } },
    order: [['fecha', 'ASC']],
  });

  const porFecha = new Map(registros.map((r) => [aTexto(r.fecha), r]));

  const filas = dias.map((fecha) => {
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

  const conDatos = filas.filter((f) => f.litros !== null);
  const total_litros = redondear(conDatos.reduce((s, f) => s + f.litros, 0));
  const total_sobrante = redondear(filas.reduce((s, f) => s + (f.sobrante || 0), 0));
  const total_faltante = redondear(filas.reduce((s, f) => s + (f.faltante || 0), 0));

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
    semana,
    precio_litro,
    moneda,
    dias: filas,
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

// @route GET /api/ruteros/hoja?rutero_id=&semana_id=
const obtenerHoja = asyncHandler(async (req, res) => {
  const rutero = await Rutero.findByPk(req.query.rutero_id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });

  const semana = await SemanaPago.findByPk(req.query.semana_id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });

  res.json({ success: true, data: await armarHoja(rutero, semana) });
});

// @route POST /api/ruteros/hoja
// body: { rutero_id, semana_id, precio_litro, moneda,
//         dias: [{ fecha, litros, sobrante, faltante, descripcion }] }
const guardarHoja = asyncHandler(async (req, res) => {
  const { rutero_id, semana_id, dias } = req.body;
  const precio_litro = aNumero(req.body.precio_litro, NaN);
  const moneda = normalizarMoneda(req.body.moneda, 'COP');

  const rutero = await Rutero.findByPk(rutero_id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });

  const semana = await SemanaPago.findByPk(semana_id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });
  if (semana.estado === 'cerrada') {
    return res.status(400).json({ success: false, message: 'La semana está cerrada. Ábrala de nuevo para editarla.' });
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
    return res.status(400).json({ success: false, message: `La fecha ${fuera.fecha} no pertenece a esta semana.` });
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
        throw Object.assign(new Error(`Litros inválidos en ${fecha}.`), { status: 400 });
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
        await RegistroLecheRutero.create(
          { rutero_id: rutero.id, fecha, ...valores },
          { transaction: transaccion }
        );
      }
    }

    await transaccion.commit();
  } catch (err) {
    await transaccion.rollback();
    if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
    throw err;
  }

  // El precio de esta semana queda guardado en el pago (aunque siga pendiente).
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
// body: { rutero_id, semana_id, marcar_pagado, observaciones }
const registrarPago = asyncHandler(async (req, res) => {
  const { rutero_id, semana_id } = req.body;
  const marcarPagado = req.body.marcar_pagado !== false;

  const rutero = await Rutero.findByPk(rutero_id);
  if (!rutero) return res.status(404).json({ success: false, message: 'Rutero no encontrado.' });

  const semana = await SemanaPago.findByPk(semana_id);
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

  res.json({
    success: true,
    message: marcarPagado ? 'Pago registrado.' : 'Pago marcado como pendiente.',
    data: pago,
  });
});

// @route GET /api/ruteros/pagos?semana_id=
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

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
  obtenerHoja,
  guardarHoja,
  registrarPago,
  listarPagos,
};
