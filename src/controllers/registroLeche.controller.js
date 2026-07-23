const { Op } = require('sequelize');
const db = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const {
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
} = require('../utils/semanas');

const { RegistroLecheProductor, Productor, SemanaPago, Ruta } = db;
const PagoProductor = db.PagoProductor || db.PagosProductores || db.PagoProductores || null;

const incluirProductor = {
  model: Productor,
  as: 'Productor',
  attributes: ['id', 'nombre', 'color_identificativo', 'moneda', 'precio_litro_base', 'precio_litro_acida'],
};

// ============================================================
//  RESOLUCIÓN DE LA SEMANA DEL PRODUCTOR
//  El usuario elige días (lunes a miércoles). Las fechas se calculan
//  solas sobre el ciclo en curso y no se muestran en pantalla.
// ============================================================

const resolverSemana = async (productor, { semana_id, dia_inicio, dia_fin, fecha_inicio }) => {
  // Reabrir una semana ya guardada del historial.
  if (!vacio(semana_id)) {
    const semana = await SemanaPago.findByPk(semana_id);
    if (!semana) throw Object.assign(new Error('Semana no encontrada.'), { status: 404 });
    if (semana.productor_id && Number(semana.productor_id) !== Number(productor.id)) {
      throw Object.assign(new Error('Esa semana pertenece a otro productor.'), { status: 400 });
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

  // Fecha exacta elegida a mano: el día de inicio se calcula solo a partir de ella.
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

  const existente = await SemanaPago.findOne({
    where: { productor_id: productor.id, fecha_inicio: fechaInicioTexto },
  });

  if (!existente) {
    return SemanaPago.create({
      productor_id: productor.id,
      fecha_inicio: fechaInicioTexto,
      fecha_fin: fechaFinTexto,
      dia_inicio: inicio,
      dia_fin: fin,
      estado: 'abierta',
    });
  }

  // Si cambió el día de cierre, se ajusta el ciclo.
  if (aTexto(existente.fecha_fin) !== fechaFinTexto || Number(existente.dia_fin) !== fin) {
    if (existente.estado === 'cerrada') return existente;

    // Al acortar la semana se eliminan los días que quedaron por fuera.
    if (fechaFinTexto < aTexto(existente.fecha_fin)) {
      await RegistroLecheProductor.destroy({
        where: {
          productor_id: productor.id,
          fecha: { [Op.gt]: fechaFinTexto, [Op.lte]: aTexto(existente.fecha_fin) },
        },
      });
    }
    await existente.update({ fecha_fin: fechaFinTexto, dia_inicio: inicio, dia_fin: fin });
  }

  return existente;
};

const armarHoja = async (productor, semana) => {
  const fechas = rangoFechas(semana.fecha_inicio, semana.fecha_fin);

  const registros = await RegistroLecheProductor.findAll({
    where: {
      productor_id: productor.id,
      fecha: { [Op.between]: [fechas[0], fechas[fechas.length - 1]] },
    },
    order: [['fecha', 'ASC']],
  });

  const porFecha = new Map(registros.map((r) => [aTexto(r.fecha), r]));

  const dias = fechas.map((fecha) => {
    const registro = porFecha.get(fecha);
    return {
      fecha, // interno: la pantalla muestra solo el nombre del día
      dia: nombreDia(fecha),
      registro_id: registro?.id || null,
      litros: registro ? Number(registro.litros) : null,
      litros_acidos: registro ? Number(registro.litros_acidos || 0) : null,
      precio_litro: registro ? Number(registro.precio_litro) : null,
      precio_litro_acida: registro ? Number(registro.precio_litro_acida || 0) : null,
      moneda: registro?.moneda || null,
      subtotal: registro ? Number(registro.subtotal || 0) : 0,
    };
  });

  const conDatos = dias.filter((d) => d.litros !== null);
  const total_litros = redondear(conDatos.reduce((s, d) => s + d.litros, 0));
  const total_litros_acidos = redondear(conDatos.reduce((s, d) => s + (d.litros_acidos || 0), 0));
  const total_pagar = redondear(conDatos.reduce((s, d) => s + d.subtotal, 0));

  const precio_litro = conDatos.length
    ? Number(conDatos[conDatos.length - 1].precio_litro)
    : Number(productor.precio_litro_base || 0);
  const precio_litro_acida = conDatos.length
    ? Number(conDatos[conDatos.length - 1].precio_litro_acida || 0)
    : Number(productor.precio_litro_acida || 0);
  const moneda = conDatos.length
    ? conDatos[conDatos.length - 1].moneda
    : normalizarMoneda(productor.moneda, 'BS');

  const pago = PagoProductor
    ? await PagoProductor.findOne({ where: { productor_id: productor.id, semana_id: semana.id } })
    : null;

  return {
    productor: {
      id: productor.id,
      nombre: productor.nombre,
      color_identificativo: productor.color_identificativo,
      precio_litro_base: productor.precio_litro_base,
      precio_litro_acida: productor.precio_litro_acida,
      moneda: productor.moneda,
    },
    semana: {
      id: semana.id,
      estado: semana.estado,
      dia_inicio: semana.dia_inicio,
      dia_fin: semana.dia_fin,
      etiqueta: etiquetaDias(semana.dia_inicio, semana.dia_fin),
    },
    precio_litro,
    precio_litro_acida,
    moneda,
    dias,
    totales: {
      dias_con_leche: conDatos.length,
      total_litros,
      total_litros_acidos,
      total_pagar,
    },
    pago,
  };
};

// @desc  Hoja de la semana de un productor
// @route GET /api/registros-leche/hoja?productor_id=&dia_inicio=&dia_fin=
//        GET /api/registros-leche/hoja?productor_id=&semana_id=   (historial)
const obtenerHoja = asyncHandler(async (req, res) => {
  const productor = await Productor.findByPk(req.query.productor_id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  try {
    const semana = await resolverSemana(productor, req.query);
    res.json({ success: true, data: await armarHoja(productor, semana) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    throw err;
  }
});

// @desc  Guardar los litros de la semana
// @route POST /api/registros-leche/hoja
// body: { productor_id, semana_id, precio_litro, precio_litro_acida, moneda,
//         dias: [{ fecha, litros, litros_acidos }] }
const guardarHoja = asyncHandler(async (req, res) => {
  const { productor_id, semana_id, dias } = req.body;
  const precio_litro = aNumero(req.body.precio_litro, NaN);
  // La leche ácida es opcional: si el productor nunca trae, se queda en 0.
  const precio_litro_acida = aNumero(req.body.precio_litro_acida, 0);
  const moneda = normalizarMoneda(req.body.moneda, 'BS');

  const productor = await Productor.findByPk(productor_id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  const semana = await SemanaPago.findByPk(semana_id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });
  if (semana.productor_id && Number(semana.productor_id) !== Number(productor.id)) {
    return res.status(400).json({ success: false, message: 'Esa semana pertenece a otro productor.' });
  }
  if (semana.estado === 'cerrada') {
    return res.status(400).json({ success: false, message: 'La semana está cerrada. Reábrala para editarla.' });
  }
  if (Number.isNaN(precio_litro) || precio_litro <= 0) {
    return res.status(400).json({ success: false, message: 'Indique el precio por litro de esta semana.' });
  }
  if (Number.isNaN(precio_litro_acida) || precio_litro_acida < 0) {
    return res.status(400).json({ success: false, message: 'El precio de la leche ácida no es válido.' });
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
      const litros_acidos = vacio(dia.litros_acidos) ? 0 : aNumero(dia.litros_acidos, NaN);

      const existente = await RegistroLecheProductor.findOne({
        where: { productor_id: productor.id, fecha },
        transaction: transaccion,
      });

      const sinNada = (litros === null || litros === 0) && litros_acidos === 0;
      if (sinNada) {
        if (existente) await existente.destroy({ transaction: transaccion });
        continue;
      }

      if (litros !== null && (Number.isNaN(litros) || litros < 0)) {
        throw Object.assign(new Error(`Litros inválidos en ${nombreDia(fecha)}.`), { status: 400 });
      }
      if (Number.isNaN(litros_acidos) || litros_acidos < 0) {
        throw Object.assign(new Error(`Litros ácidos inválidos en ${nombreDia(fecha)}.`), { status: 400 });
      }
      if (litros_acidos > 0 && precio_litro_acida <= 0) {
        throw Object.assign(
          new Error(`Indique el precio de la leche ácida antes de cargar litros ácidos (${nombreDia(fecha)}).`),
          { status: 400 }
        );
      }

      const valores = {
        litros: litros === null ? 0 : litros,
        litros_acidos,
        precio_litro,
        precio_litro_acida,
        moneda,
        semana_id: semana.id,
      };

      if (existente) {
        await existente.update(valores, { transaction: transaccion });
      } else {
        await RegistroLecheProductor.create(
          { productor_id: productor.id, fecha, ...valores },
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

  res.json({ success: true, message: 'Semana guardada.', data: await armarHoja(productor, semana) });
});

// @desc  Registrar el pago de la semana
// @route POST /api/registros-leche/hoja/pago
const registrarPago = asyncHandler(async (req, res) => {
  if (!PagoProductor) {
    return res.status(500).json({ success: false, message: 'Falta el modelo de pagos a productores.' });
  }

  const marcarPagado = req.body.marcar_pagado !== false;

  const productor = await Productor.findByPk(req.body.productor_id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  const semana = await SemanaPago.findByPk(req.body.semana_id);
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

  res.json({ success: true, message: marcarPagado ? 'Pago registrado.' : 'Pago pendiente.', data: pago });
});

// @desc  Semanas anteriores de un productor
// @route GET /api/registros-leche/historial?productor_id=
const historial = asyncHandler(async (req, res) => {
  const productor = await Productor.findByPk(req.query.productor_id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  const semanas = await SemanaPago.findAll({
    where: { productor_id: productor.id },
    order: [['fecha_inicio', 'DESC']],
    limit: 20,
  });

  const registros = await RegistroLecheProductor.findAll({
    where: { productor_id: productor.id, semana_id: semanas.map((s) => s.id) },
  });

  const pagos = PagoProductor
    ? await PagoProductor.findAll({
        where: { productor_id: productor.id, semana_id: semanas.map((s) => s.id) },
      })
    : [];

  const data = semanas.map((s) => {
    const propios = registros.filter((r) => Number(r.semana_id) === Number(s.id));
    const pago = pagos.find((p) => Number(p.semana_id) === Number(s.id));
    return {
      id: s.id,
      estado: s.estado,
      dia_inicio: s.dia_inicio,
      dia_fin: s.dia_fin,
      etiqueta: etiquetaDias(s.dia_inicio, s.dia_fin),
      dias_con_leche: propios.length,
      total_litros: redondear(propios.reduce((acc, r) => acc + Number(r.litros), 0)),
      total_litros_acidos: redondear(propios.reduce((acc, r) => acc + Number(r.litros_acidos || 0), 0)),
      total_pagar: redondear(propios.reduce((acc, r) => acc + Number(r.subtotal || 0), 0)),
      moneda: propios[0]?.moneda || 'BS',
      estado_pago: pago?.estado_pago || null,
      fecha_pago: pago?.fecha_pago || null,
    };
  });

  res.json({ success: true, data });
});

// @desc  Cerrar o reabrir la semana
// @route PATCH /api/registros-leche/semanas/:id/estado   body: { estado }
const cambiarEstadoSemana = asyncHandler(async (req, res) => {
  const semana = await SemanaPago.findByPk(req.params.id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });

  const estado = String(req.body.estado || '').toLowerCase();
  if (!['abierta', 'cerrada'].includes(estado)) {
    return res.status(400).json({ success: false, message: 'Estado inválido.' });
  }

  await semana.update({ estado });
  res.json({ success: true, data: semana, message: estado === 'cerrada' ? 'Semana cerrada.' : 'Semana reabierta.' });
});

// ============================================================
//  REGISTROS SUELTOS (compatibilidad)
// ============================================================

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

const eliminar = asyncHandler(async (req, res) => {
  const registro = await RegistroLecheProductor.findByPk(req.params.id);
  if (!registro) return res.status(404).json({ success: false, message: 'Registro no encontrado.' });

  await registro.destroy();
  res.json({ success: true, message: 'Registro eliminado.' });
});

module.exports = {
  obtenerHoja,
  guardarHoja,
  registrarPago,
  historial,
  cambiarEstadoSemana,
  listar,
  eliminar,
};