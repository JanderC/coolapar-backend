const { Op } = require('sequelize');
const db = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const {
  MONEDAS,
  MAX_DIAS_SEMANA,
  vacio,
  aTexto,
  esFechaValida,
  rangoFechas,
  nombreDia,
  aNumero,
  redondear,
  normalizarMoneda,
} = require('../utils/semanas');

const { RegistroLecheProductor, Productor, SemanaPago, Ruta } = db;
// El nombre del modelo de pagos cambia según cómo se haya definido en models/.
const PagoProductor = db.PagoProductor || db.PagosProductores || db.PagoProductores || null;

const incluirProductor = {
  model: Productor,
  as: 'Productor',
  attributes: ['id', 'nombre', 'color_identificativo', 'moneda', 'precio_litro_base', 'ruta_id'],
  include: Ruta ? [{ model: Ruta, as: 'Ruta', attributes: ['id', 'nombre', 'color_identificativo'], required: false }] : [],
};

// ============================================================
//  SEMANAS
// ============================================================

// @desc  Listar semanas (más reciente primero)
// @route GET /api/registros-leche/semanas
const listarSemanas = asyncHandler(async (req, res) => {
  const semanas = await SemanaPago.findAll({ order: [['fecha_inicio', 'DESC']], limit: 52 });
  res.json({ success: true, data: semanas });
});

// @desc  Abrir una semana eligiendo día de inicio y día de cierre
// @route POST /api/registros-leche/semanas   body: { fecha_inicio, fecha_fin }
const abrirSemana = asyncHandler(async (req, res) => {
  const fecha_inicio = String(req.body.fecha_inicio || '');
  const fecha_fin = String(req.body.fecha_fin || '');

  if (!esFechaValida(fecha_inicio) || !esFechaValida(fecha_fin)) {
    return res.status(400).json({ success: false, message: 'Indique la fecha de inicio y la de cierre.' });
  }
  if (fecha_fin < fecha_inicio) {
    return res.status(400).json({ success: false, message: 'La fecha de cierre no puede ser anterior al inicio.' });
  }
  if (rangoFechas(fecha_inicio, fecha_fin).length >= MAX_DIAS_SEMANA) {
    return res.status(400).json({ success: false, message: `La semana no puede pasar de ${MAX_DIAS_SEMANA} días.` });
  }

  const existente = await SemanaPago.findOne({ where: { fecha_inicio, fecha_fin } });
  if (existente) {
    return res.json({ success: true, data: existente, message: 'Esa semana ya estaba abierta.' });
  }

  const semana = await SemanaPago.create({ fecha_inicio, fecha_fin, estado: 'abierta' });
  res.status(201).json({ success: true, data: semana });
});

// @desc  Cerrar una semana
// @route PATCH /api/registros-leche/semanas/:id/cerrar
const cerrarSemana = asyncHandler(async (req, res) => {
  const semana = await SemanaPago.findByPk(req.params.id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });

  await semana.update({ estado: 'cerrada' });
  res.json({ success: true, data: semana, message: 'Semana cerrada.' });
});

// ============================================================
//  HOJA SEMANAL DE UN PRODUCTOR
// ============================================================

const armarHoja = async (productor, semana) => {
  const dias = rangoFechas(semana.fecha_inicio, semana.fecha_fin);

  const registros = await RegistroLecheProductor.findAll({
    where: { productor_id: productor.id, fecha: { [Op.between]: [dias[0], dias[dias.length - 1]] } },
    order: [['fecha', 'ASC']],
  });

  const porFecha = new Map(registros.map((r) => [aTexto(r.fecha), r]));

  const filas = dias.map((fecha) => {
    const registro = porFecha.get(fecha);
    return {
      fecha,
      dia: nombreDia(fecha),
      registro_id: registro?.id || null,
      litros: registro ? Number(registro.litros) : null,
      precio_litro: registro ? Number(registro.precio_litro) : null,
      moneda: registro?.moneda || null,
      subtotal: registro ? Number(registro.subtotal || 0) : 0,
    };
  });

  const conDatos = filas.filter((f) => f.litros !== null);
  const total_litros = redondear(conDatos.reduce((s, f) => s + f.litros, 0));
  const total_pagar = redondear(conDatos.reduce((s, f) => s + f.subtotal, 0));

  const precio_litro = conDatos.length
    ? Number(conDatos[conDatos.length - 1].precio_litro)
    : Number(productor.precio_litro_base || 0);
  const moneda = conDatos.length
    ? conDatos[conDatos.length - 1].moneda
    : normalizarMoneda(productor.moneda, 'BS');

  let pago = null;
  if (PagoProductor) {
    pago = await PagoProductor.findOne({ where: { productor_id: productor.id, semana_id: semana.id } });
  }

  return {
    productor: {
      id: productor.id,
      nombre: productor.nombre,
      color_identificativo: productor.color_identificativo,
      precio_litro_base: productor.precio_litro_base,
      moneda: productor.moneda,
    },
    semana,
    precio_litro,
    moneda,
    dias: filas,
    totales: {
      dias_con_leche: conDatos.length,
      total_litros,
      total_pagar,
    },
    pago,
  };
};

// @desc  Traer la hoja semanal de un productor (días vacíos incluidos)
// @route GET /api/registros-leche/hoja?productor_id=&semana_id=
const obtenerHoja = asyncHandler(async (req, res) => {
  const { productor_id, semana_id } = req.query;

  const productor = await Productor.findByPk(productor_id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  const semana = await SemanaPago.findByPk(semana_id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });

  res.json({ success: true, data: await armarHoja(productor, semana) });
});

// @desc  Guardar la semana completa de un productor
// @route POST /api/registros-leche/hoja
// body: { productor_id, semana_id, precio_litro, moneda, dias: [{ fecha, litros }] }
const guardarHoja = asyncHandler(async (req, res) => {
  const { productor_id, semana_id, dias } = req.body;
  const precio_litro = aNumero(req.body.precio_litro, NaN);
  const moneda = normalizarMoneda(req.body.moneda, 'BS');

  const productor = await Productor.findByPk(productor_id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  const semana = await SemanaPago.findByPk(semana_id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });
  if (semana.estado === 'cerrada') {
    return res.status(400).json({ success: false, message: 'La semana está cerrada. Ábrala de nuevo para editarla.' });
  }

  if (Number.isNaN(precio_litro) || precio_litro <= 0) {
    return res.status(400).json({ success: false, message: 'Indique el precio por litro de esta semana.' });
  }
  if (!Array.isArray(dias) || dias.length === 0) {
    return res.status(400).json({ success: false, message: 'No llegaron los días de la semana.' });
  }

  const validas = new Set(rangoFechas(semana.fecha_inicio, semana.fecha_fin));
  const fueraDeRango = dias.find((d) => !validas.has(String(d.fecha)));
  if (fueraDeRango) {
    return res.status(400).json({ success: false, message: `La fecha ${fueraDeRango.fecha} no pertenece a esta semana.` });
  }

  const transaccion = await db.sequelize.transaction();
  try {
    for (const dia of dias) {
      const fecha = String(dia.fecha);
      const litros = vacio(dia.litros) ? null : aNumero(dia.litros, NaN);

      const existente = await RegistroLecheProductor.findOne({
        where: { productor_id: productor.id, fecha },
        transaction: transaccion,
      });

      // Día sin leche: si había un registro, se borra.
      if (litros === null || litros === 0) {
        if (existente) await existente.destroy({ transaction: transaccion });
        continue;
      }

      if (Number.isNaN(litros) || litros < 0) {
        throw Object.assign(new Error(`Litros inválidos en ${fecha}.`), { status: 400 });
      }

      if (existente) {
        await existente.update({ litros, precio_litro, moneda, semana_id: semana.id }, { transaction: transaccion });
      } else {
        await RegistroLecheProductor.create(
          { productor_id: productor.id, semana_id: semana.id, fecha, litros, precio_litro, moneda },
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

  const hoja = await armarHoja(productor, semana);
  res.json({ success: true, message: 'Semana guardada.', data: hoja });
});

// @desc  Registrar el pago de la semana de un productor
// @route POST /api/registros-leche/hoja/pago
// body: { productor_id, semana_id, marcar_pagado }
const registrarPago = asyncHandler(async (req, res) => {
  if (!PagoProductor) {
    return res.status(500).json({
      success: false,
      message: 'No se encontró el modelo de pagos a productores en models/.',
    });
  }

  const { productor_id, semana_id } = req.body;
  const marcarPagado = req.body.marcar_pagado !== false;

  const productor = await Productor.findByPk(productor_id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  const semana = await SemanaPago.findByPk(semana_id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });

  const hoja = await armarHoja(productor, semana);
  if (hoja.totales.total_litros <= 0) {
    return res.status(400).json({ success: false, message: 'Esta semana no tiene litros cargados.' });
  }

  const valores = {
    total_litros: hoja.totales.total_litros,
    total_pagar: hoja.totales.total_pagar,
    precio_litro: hoja.precio_litro,
    moneda: hoja.moneda,
    estado_pago: marcarPagado ? 'pagado' : 'pendiente',
    fecha_pago: marcarPagado ? aTexto(new Date()) : null,
  };

  const existente = await PagoProductor.findOne({
    where: { productor_id: productor.id, semana_id: semana.id },
  });

  const pago = existente
    ? await existente.update(valores)
    : await PagoProductor.create({ productor_id: productor.id, semana_id: semana.id, ...valores });

  res.json({
    success: true,
    message: marcarPagado ? 'Pago registrado.' : 'Pago guardado como pendiente.',
    data: pago,
  });
});

// @desc  Resumen de la semana: todos los productores con sus totales
// @route GET /api/registros-leche/resumen?semana_id=
const resumenSemana = asyncHandler(async (req, res) => {
  const semana = await SemanaPago.findByPk(req.query.semana_id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });

  const registros = await RegistroLecheProductor.findAll({
    where: { semana_id: semana.id },
    include: [incluirProductor],
    order: [['fecha', 'ASC']],
  });

  const mapa = new Map();
  registros.forEach((r) => {
    const p = r.Productor;
    if (!p) return;
    if (!mapa.has(p.id)) {
      mapa.set(p.id, {
        productor_id: p.id,
        nombre: p.nombre,
        color_identificativo: p.color_identificativo,
        ruta: p.Ruta ? { nombre: p.Ruta.nombre, color: p.Ruta.color_identificativo } : null,
        moneda: r.moneda,
        precio_litro: Number(r.precio_litro),
        dias: 0,
        total_litros: 0,
        total_pagar: 0,
      });
    }
    const fila = mapa.get(p.id);
    fila.dias += 1;
    fila.total_litros = redondear(fila.total_litros + Number(r.litros));
    fila.total_pagar = redondear(fila.total_pagar + Number(r.subtotal || 0));
    fila.precio_litro = Number(r.precio_litro);
    fila.moneda = r.moneda;
  });

  const filas = [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));

  const totalesPorMoneda = filas.reduce((acc, f) => {
    acc[f.moneda] = redondear((acc[f.moneda] || 0) + f.total_pagar);
    return acc;
  }, {});

  res.json({
    success: true,
    data: {
      semana,
      productores: filas,
      total_litros: redondear(filas.reduce((s, f) => s + f.total_litros, 0)),
      total_por_moneda: totalesPorMoneda,
    },
  });
});

// ============================================================
//  REGISTROS SUELTOS (compatibilidad)
// ============================================================

// @route GET /api/registros-leche?productor_id=&semana_id=&desde=&hasta=
const listar = asyncHandler(async (req, res) => {
  const { productor_id, semana_id, desde, hasta } = req.query;
  const where = {};
  if (!vacio(productor_id)) where.productor_id = Number(productor_id);
  if (!vacio(semana_id)) where.semana_id = Number(semana_id);
  if (!vacio(desde) && !vacio(hasta)) where.fecha = { [Op.between]: [desde, hasta] };

  const registros = await RegistroLecheProductor.findAll({
    where,
    include: [incluirProductor],
    order: [['fecha', 'DESC']],
  });

  res.json({ success: true, data: registros });
});

// @route POST /api/registros-leche
const crear = asyncHandler(async (req, res) => {
  const { productor_id, semana_id, fecha } = req.body;
  const litros = aNumero(req.body.litros, NaN);

  const productor = await Productor.findByPk(productor_id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  const semana = await SemanaPago.findByPk(semana_id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana de pago no encontrada.' });

  if (Number.isNaN(litros) || litros <= 0) {
    return res.status(400).json({ success: false, message: 'Los litros deben ser mayores a 0.' });
  }

  const precio_litro = aNumero(req.body.precio_litro, aNumero(productor.precio_litro_base, 0));
  if (precio_litro <= 0) {
    return res.status(400).json({ success: false, message: 'Indique el precio por litro.' });
  }

  const moneda = normalizarMoneda(req.body.moneda || productor.moneda, 'BS');

  const duplicado = await RegistroLecheProductor.findOne({ where: { productor_id, fecha } });
  if (duplicado) {
    return res.status(409).json({
      success: false,
      message: 'Ese productor ya tiene leche registrada en esa fecha. Edite el día en la hoja semanal.',
    });
  }

  const registro = await RegistroLecheProductor.create({
    productor_id,
    semana_id,
    fecha,
    litros,
    precio_litro,
    moneda,
  });

  res.status(201).json({ success: true, data: registro });
});

// @route PUT /api/registros-leche/:id
const actualizar = asyncHandler(async (req, res) => {
  const registro = await RegistroLecheProductor.findByPk(req.params.id);
  if (!registro) return res.status(404).json({ success: false, message: 'Registro no encontrado.' });

  const datos = {};
  if (req.body.litros !== undefined) datos.litros = aNumero(req.body.litros, NaN);
  if (req.body.precio_litro !== undefined) datos.precio_litro = aNumero(req.body.precio_litro, NaN);
  if (req.body.fecha !== undefined) datos.fecha = req.body.fecha;
  if (req.body.moneda !== undefined) datos.moneda = normalizarMoneda(req.body.moneda, registro.moneda);

  if (datos.litros !== undefined && (Number.isNaN(datos.litros) || datos.litros < 0)) {
    return res.status(400).json({ success: false, message: 'Litros inválidos.' });
  }
  if (datos.precio_litro !== undefined && (Number.isNaN(datos.precio_litro) || datos.precio_litro <= 0)) {
    return res.status(400).json({ success: false, message: 'Precio por litro inválido.' });
  }

  await registro.update(datos);
  res.json({ success: true, data: registro });
});

// @route DELETE /api/registros-leche/:id
const eliminar = asyncHandler(async (req, res) => {
  const registro = await RegistroLecheProductor.findByPk(req.params.id);
  if (!registro) return res.status(404).json({ success: false, message: 'Registro no encontrado.' });

  await registro.destroy();
  res.json({ success: true, message: 'Registro eliminado.' });
});

module.exports = {
  listarSemanas,
  abrirSemana,
  cerrarSemana,
  obtenerHoja,
  guardarHoja,
  registrarPago,
  resumenSemana,
  listar,
  crear,
  actualizar,
  eliminar,
  MONEDAS,
};