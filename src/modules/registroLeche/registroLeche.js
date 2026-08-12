const express = require('express');
const { body, param, query } = require('express-validator');
const { Op } = require('sequelize');

const db = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');
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
} = require('../../utils/semanas');

const router = express.Router();
const MONEDAS = ['BS', 'USD', 'COP'];

const { RegistroLecheProductor, Productor, SemanaPago } = db;
const PagoProductor = db.PagoProductor || null;

const incluirProductor = {
  model: Productor,
  as: 'Productor',
  attributes: [
    'id',
    'nombre',
    'color_identificativo',
    'moneda',
    'precio_litro_base',
    'precio_litro_acida',
    'precio_litro_bajo_grasa',
  ],
};

// ============================================================
//  SEMANA DEL PRODUCTOR
//
//  Reglas de oro:
//   1. Consultar NUNCA escribe en la base de datos.
//   2. Solo "Guardar semana" crea o modifica una fila de semanas_pago.
//   3. Dos semanas del mismo productor no pueden compartir días. Si se
//      pide un rango que pisa una semana ya guardada, se abre esa semana
//      en lugar de crear otra. Esto es lo que producía las "semanas en
//      cero": al guardar la semana nueva, los días se mudaban a ella
//      (registro_leche_productor es único por productor+fecha) y la
//      semana vieja quedaba en el historial sin un solo litro.
//   4. Una semana sin litros no se guarda; y si al editarla queda sin
//      litros, se elimina sola del historial.
// ============================================================

const error400 = (mensaje) => Object.assign(new Error(mensaje), { status: 400 });
const error404 = (mensaje) => Object.assign(new Error(mensaje), { status: 404 });
const error409 = (mensaje) => Object.assign(new Error(mensaje), { status: 409 });

// ------------------------------------------------------------
//  semanas_pago NO es exclusiva de los productores: el módulo de
//  ruteros (y cualquier otro que se agregue) cuelga sus registros de la
//  misma fila. Por eso, antes de borrar una semana hay que preguntarle a
//  la base quién más la está usando. Si no, Postgres corta la operación
//  con un error de clave foránea y, peor, se podrían borrar los datos de
//  otro módulo.
// ------------------------------------------------------------

const NOMBRE_TABLA_SEMANAS = String(SemanaPago.getTableName());
const NOMBRE_TABLA_REGISTROS = String(RegistroLecheProductor.getTableName());
const NOMBRE_TABLA_PAGOS = PagoProductor ? String(PagoProductor.getTableName()) : null;

// Nombres legibles para los mensajes de error.
const MODULOS = {
  registro_leche_rutero: 'registro de ruteros',
  registro_leche_ruteros: 'registro de ruteros',
  inventario_insumos: 'inventario de insumos',
  pagos_ruteros: 'pagos a ruteros',
};

const nombreModulo = (tabla) => MODULOS[tabla] || tabla;

let cacheReferencias = null;

/** Tablas y columnas que apuntan a semanas_pago, leídas del catálogo de
 * Postgres. Se consulta una sola vez por proceso. */
const tablasQueReferencianSemanas = async () => {
  if (cacheReferencias) return cacheReferencias;

  const filas = await db.sequelize.query(
    `SELECT origen.relname AS tabla, atributo.attname AS columna
       FROM pg_constraint restriccion
       JOIN pg_class origen  ON origen.oid  = restriccion.conrelid
       JOIN pg_class destino ON destino.oid = restriccion.confrelid
       JOIN unnest(restriccion.conkey) AS clave(attnum) ON TRUE
       JOIN pg_attribute atributo
         ON atributo.attrelid = origen.oid AND atributo.attnum = clave.attnum
      WHERE restriccion.contype = 'f'
        AND destino.relname = :tabla`,
    { replacements: { tabla: NOMBRE_TABLA_SEMANAS }, type: db.Sequelize.QueryTypes.SELECT }
  );

  // Las del propio módulo de productores sí se borran en cascada manual.
  cacheReferencias = filas.filter(
    (f) => f.tabla !== NOMBRE_TABLA_REGISTROS && f.tabla !== NOMBRE_TABLA_PAGOS
  );
  return cacheReferencias;
};

/** Módulos ajenos que todavía tienen datos colgando de esta semana. */
const usosAjenos = async (semanaId) => {
  let referencias;
  try {
    referencias = await tablasQueReferencianSemanas();
  } catch {
    // Si el catálogo no se puede leer (otro motor, permisos), se prefiere
    // no borrar nada a borrar de más.
    return [{ tabla: 'desconocido', filas: 0, incierto: true }];
  }

  const usos = [];
  for (const referencia of referencias) {
    const filas = await db.sequelize.query(
      `SELECT COUNT(*)::int AS total FROM "${referencia.tabla}" WHERE "${referencia.columna}" = :id`,
      { replacements: { id: semanaId }, type: db.Sequelize.QueryTypes.SELECT }
    );
    const total = Number(filas[0]?.total || 0);
    if (total > 0) usos.push({ tabla: referencia.tabla, filas: total });
  }
  return usos;
};

const textoUsos = (usos) =>
  usos.map((u) => (u.incierto ? 'otro módulo' : `${nombreModulo(u.tabla)} (${u.filas} registro(s))`)).join(', ');

/** Calcula fecha de inicio/fin y día de inicio/fin a partir de los
 * parámetros que manda el frontend, sin tocar la base de datos. */
const calcularCiclo = ({ dia_inicio, dia_fin, fecha_inicio, fecha_fin }) => {
  // Caso 1: rango exacto. Lo usa la impresión, que necesita pedir el mismo
  // tramo de fechas para varios productores a la vez.
  if (!vacio(fecha_inicio) && !vacio(fecha_fin)) {
    if (!esFechaValida(fecha_inicio) || !esFechaValida(fecha_fin)) {
      throw error400('El rango de fechas no es válido.');
    }
    const desde = aTexto(fecha_inicio);
    const hasta = aTexto(fecha_fin);
    if (hasta < desde) throw error400('La fecha de cierre es anterior a la de inicio.');
    return {
      inicio: diaSemana(desde),
      fin: diaSemana(hasta),
      fechaInicioTexto: desde,
      fechaFinTexto: hasta,
    };
  }

  if (!esDiaValido(dia_fin)) {
    throw error400('Indique el día en que termina la semana.');
  }
  const fin = Number(dia_fin);

  // Caso 2: fecha exacta de inicio elegida a mano. El día que le
  // corresponde (lunes, martes...) se calcula solo a partir de ella.
  if (!vacio(fecha_inicio)) {
    if (!esFechaValida(fecha_inicio)) throw error400('La fecha de inicio no es válida.');
    const inicio = diaSemana(fecha_inicio);
    const fechaFin = sumarDias(fecha_inicio, largoCiclo(inicio, fin) - 1);
    return { inicio, fin, fechaInicioTexto: aTexto(fecha_inicio), fechaFinTexto: aTexto(fechaFin) };
  }

  // Caso 3: solo días de la semana; se resuelve contra el ciclo vigente.
  if (!esDiaValido(dia_inicio)) {
    throw error400('Indique el día en que inicia y el día en que termina.');
  }
  const inicio = Number(dia_inicio);
  const { fecha_inicio: fechaInicioTexto, fecha_fin: fechaFinTexto } = cicloVigente(inicio, fin);
  return { inicio, fin, fechaInicioTexto: aTexto(fechaInicioTexto), fechaFinTexto: aTexto(fechaFinTexto) };
};

/** Semana ya guardada del mismo productor que comparte al menos un día
 * con el rango pedido. Es la pieza que evita los duplicados solapados. */
const buscarSemanaSolapada = async (productorId, desde, hasta, idExcluido = null) => {
  const where = {
    productor_id: productorId,
    fecha_inicio: { [Op.lte]: hasta },
    fecha_fin: { [Op.gte]: desde },
  };
  if (idExcluido) where.id = { [Op.ne]: idExcluido };

  return SemanaPago.findOne({ where, order: [['fecha_inicio', 'ASC']] });
};

/** Objeto de semana "en memoria", sin persistir: se usa para previsualizar
 * una semana que el productor todavía no ha guardado ninguna vez. */
const semanaVirtual = ({ productor_id, fechaInicioTexto, fechaFinTexto, inicio, fin }) => ({
  id: null,
  productor_id,
  fecha_inicio: fechaInicioTexto,
  fecha_fin: fechaFinTexto,
  dia_inicio: inicio,
  dia_fin: fin,
  estado: 'abierta',
});

/**
 * SOLO LECTURA. Devuelve la semana que corresponde a los parámetros
 * pedidos, sin crear ni modificar nada.
 *  - Con semana_id: la trae tal cual quedó guardada (reabrir historial).
 *  - Con fechas/días: si el rango pisa una semana guardada, devuelve ESA
 *    semana con sus fechas reales. Si no pisa ninguna, arma una semana
 *    virtual (id: null) solo para mostrar en pantalla.
 */
const previsualizarSemana = async (productor, query) => {
  if (!vacio(query.semana_id)) {
    const semana = await SemanaPago.findByPk(query.semana_id);
    if (!semana) throw error404('Semana no encontrada.');
    if (semana.productor_id && Number(semana.productor_id) !== Number(productor.id)) {
      throw error400('Esa semana pertenece a otro productor.');
    }
    return semana;
  }

  const { inicio, fin, fechaInicioTexto, fechaFinTexto } = calcularCiclo(query);

  const solapada = await buscarSemanaSolapada(productor.id, fechaInicioTexto, fechaFinTexto);

  if (!solapada) {
    return semanaVirtual({ productor_id: productor.id, fechaInicioTexto, fechaFinTexto, inicio, fin });
  }

  // Coincide el arranque y la semana sigue abierta: se previsualiza con el
  // día de cierre que el usuario está probando ahora mismo, PERO sin
  // escribirlo. Solo queda firme si presiona "Guardar semana".
  if (aTexto(solapada.fecha_inicio) === fechaInicioTexto && solapada.estado !== 'cerrada') {
    return { ...solapada.toJSON(), fecha_fin: fechaFinTexto, dia_fin: fin };
  }

  // Cualquier otro solapamiento: manda lo guardado.
  return solapada;
};

/**
 * ÚNICO lugar que crea o modifica una fila de semanas_pago. Se llama
 * exclusivamente desde "Guardar semana" (POST /hoja), nunca desde una
 * consulta de lectura.
 */
const confirmarSemana = async (productor, body, { permitirCrear }) => {
  if (!vacio(body.semana_id)) {
    const semana = await SemanaPago.findByPk(body.semana_id);
    if (!semana) throw error404('Semana no encontrada.');
    if (semana.productor_id && Number(semana.productor_id) !== Number(productor.id)) {
      throw error400('Esa semana pertenece a otro productor.');
    }
    if (semana.estado === 'cerrada') {
      throw error400('La semana está cerrada. Reábrala para editarla.');
    }
    return semana;
  }

  const { inicio, fin, fechaInicioTexto, fechaFinTexto } = calcularCiclo(body);
  const solapada = await buscarSemanaSolapada(productor.id, fechaInicioTexto, fechaFinTexto);

  if (!solapada) {
    if (!permitirCrear) throw error400('No hay litros cargados: no se guardó ninguna semana.');
    return SemanaPago.create({
      productor_id: productor.id,
      fecha_inicio: fechaInicioTexto,
      fecha_fin: fechaFinTexto,
      dia_inicio: inicio,
      dia_fin: fin,
      estado: 'abierta',
    });
  }

  if (solapada.estado === 'cerrada') {
    throw error400(
      `La semana del ${aTexto(solapada.fecha_inicio)} al ${aTexto(solapada.fecha_fin)} está cerrada. Reábrala para editarla.`
    );
  }

  // Arranca en otro día y pisa una semana guardada: se bloquea. Antes esto
  // creaba una segunda semana y los días se mudaban a ella, dejando la
  // primera en cero.
  if (aTexto(solapada.fecha_inicio) !== fechaInicioTexto) {
    throw error409(
      `Ya hay una semana guardada del ${aTexto(solapada.fecha_inicio)} al ${aTexto(solapada.fecha_fin)} que incluye esos días. ` +
        'Ábrala desde el historial para editarla, o elimínela antes de crear otra.'
    );
  }

  // Mismo arranque: se ajusta el día de cierre (aquí sí se guarda).
  if (aTexto(solapada.fecha_fin) !== fechaFinTexto || Number(solapada.dia_fin) !== fin) {
    if (fechaFinTexto < aTexto(solapada.fecha_fin)) {
      // Al acortar la semana se eliminan los días que quedaron por fuera.
      await RegistroLecheProductor.destroy({
        where: {
          productor_id: productor.id,
          fecha: { [Op.gt]: fechaFinTexto, [Op.lte]: aTexto(solapada.fecha_fin) },
        },
      });
    } else {
      // Al alargarla, no puede invadir la siguiente semana guardada.
      const siguiente = await buscarSemanaSolapada(productor.id, fechaInicioTexto, fechaFinTexto, solapada.id);
      if (siguiente) {
        throw error409(
          `No se puede extender hasta el ${fechaFinTexto}: ya hay una semana guardada que empieza el ${aTexto(siguiente.fecha_inicio)}.`
        );
      }
    }
    await solapada.update({ fecha_fin: fechaFinTexto, dia_inicio: inicio, dia_fin: fin });
  }

  return solapada;
};

/**
 * Borra una semana con los días y el pago del productor.
 * Si otro módulo (ruteros, insumos...) todavía cuelga de esa misma semana,
 * NO se borra: se lanza un 409 explicando quién la está usando.
 */
const borrarSemanaCompleta = async (semana) => {
  const usos = await usosAjenos(semana.id);
  if (usos.length > 0) {
    throw error409(
      `No se puede eliminar esta semana porque la está usando el ${textoUsos(usos)}. ` +
        'Borre primero esos registros desde su módulo.'
    );
  }

  await RegistroLecheProductor.destroy({ where: { semana_id: semana.id } });
  if (PagoProductor) {
    await PagoProductor.destroy({ where: { semana_id: semana.id } });
  }
  await semana.destroy();
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
      litros_bajo_grasa: registro ? Number(registro.litros_bajo_grasa || 0) : null,
      precio_litro: registro ? Number(registro.precio_litro) : null,
      precio_litro_acida: registro ? Number(registro.precio_litro_acida || 0) : null,
      precio_litro_bajo_grasa: registro ? Number(registro.precio_litro_bajo_grasa || 0) : null,
      moneda: registro?.moneda || null,
      subtotal: registro ? Number(registro.subtotal || 0) : 0,
    };
  });

  const conDatos = dias.filter((d) => d.litros !== null);
  const total_litros = redondear(conDatos.reduce((s, d) => s + d.litros, 0));
  const total_litros_acidos = redondear(conDatos.reduce((s, d) => s + (d.litros_acidos || 0), 0));
  const total_litros_bajo_grasa = redondear(conDatos.reduce((s, d) => s + (d.litros_bajo_grasa || 0), 0));

  // Subtotales separados por categoría, además del total general.
  const total_pagar_normal = redondear(conDatos.reduce((s, d) => s + d.litros * (d.precio_litro || 0), 0));
  const total_pagar_acida = redondear(
    conDatos.reduce((s, d) => s + (d.litros_acidos || 0) * (d.precio_litro_acida || 0), 0)
  );
  const total_pagar_bajo_grasa = redondear(
    conDatos.reduce((s, d) => s + (d.litros_bajo_grasa || 0) * (d.precio_litro_bajo_grasa || 0), 0)
  );
  const total_pagar = redondear(conDatos.reduce((s, d) => s + d.subtotal, 0));

  const precio_litro = conDatos.length
    ? Number(conDatos[conDatos.length - 1].precio_litro)
    : Number(productor.precio_litro_base || 0);
  const precio_litro_acida = conDatos.length
    ? Number(conDatos[conDatos.length - 1].precio_litro_acida || 0)
    : Number(productor.precio_litro_acida || 0);
  const precio_litro_bajo_grasa = conDatos.length
    ? Number(conDatos[conDatos.length - 1].precio_litro_bajo_grasa || 0)
    : Number(productor.precio_litro_bajo_grasa || 0);
  const moneda = conDatos.length
    ? conDatos[conDatos.length - 1].moneda
    : normalizarMoneda(productor.moneda, 'BS');

  // Sin id persistido no hay pago posible: la semana todavía no existe.
  const pago =
    PagoProductor && semana.id
      ? await PagoProductor.findOne({ where: { productor_id: productor.id, semana_id: semana.id } })
      : null;

  return {
    productor: {
      id: productor.id,
      nombre: productor.nombre,
      color_identificativo: productor.color_identificativo,
      precio_litro_base: productor.precio_litro_base,
      precio_litro_acida: productor.precio_litro_acida,
      precio_litro_bajo_grasa: productor.precio_litro_bajo_grasa,
      moneda: productor.moneda,
    },
    semana: {
      id: semana.id,
      guardada: semana.id !== null && semana.id !== undefined,
      estado: semana.estado,
      // El frontend necesita las fechas reales: la semana que devuelve el
      // servidor puede no ser exactamente la que se pidió en pantalla.
      fecha_inicio: aTexto(semana.fecha_inicio),
      fecha_fin: aTexto(semana.fecha_fin),
      dia_inicio: semana.dia_inicio,
      dia_fin: semana.dia_fin,
      etiqueta: etiquetaDias(semana.dia_inicio, semana.dia_fin),
    },
    precio_litro,
    precio_litro_acida,
    precio_litro_bajo_grasa,
    moneda,
    dias,
    totales: {
      dias_con_leche: conDatos.length,
      total_litros,
      total_litros_acidos,
      total_litros_bajo_grasa,
      total_pagar_normal,
      total_pagar_acida,
      total_pagar_bajo_grasa,
      total_pagar,
    },
    pago,
  };
};

// @desc  Hoja de la semana de un productor (solo lectura, no crea nada)
// @route GET /api/registros-leche/hoja?productor_id=&fecha_inicio=&dia_fin=
//        GET /api/registros-leche/hoja?productor_id=&fecha_inicio=&fecha_fin=  (impresión)
//        GET /api/registros-leche/hoja?productor_id=&semana_id=                (historial)
const obtenerHoja = asyncHandler(async (req, res) => {
  const productor = await Productor.findByPk(req.query.productor_id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  try {
    const semana = await previsualizarSemana(productor, req.query);
    res.json({ success: true, data: await armarHoja(productor, semana) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    throw err;
  }
});

// @desc  Guardar los litros de la semana. Es el ÚNICO momento en que se
// crea o actualiza la fila de semanas_pago.
// @route POST /api/registros-leche/hoja
// body: { productor_id, semana_id?, fecha_inicio?, dia_fin?,
//         precio_litro, precio_litro_acida, precio_litro_bajo_grasa, moneda,
//         dias: [{ fecha, litros, litros_acidos, litros_bajo_grasa }] }
const guardarHoja = asyncHandler(async (req, res) => {
  const { productor_id, dias } = req.body;
  const precio_litro = aNumero(req.body.precio_litro, NaN);
  // La leche ácida y la baja en grasa son opcionales: si el productor
  // nunca trae, se quedan en 0.
  const precio_litro_acida = aNumero(req.body.precio_litro_acida, 0);
  const precio_litro_bajo_grasa = aNumero(req.body.precio_litro_bajo_grasa, 0);
  const moneda = normalizarMoneda(req.body.moneda, 'BS');

  const productor = await Productor.findByPk(productor_id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  if (Number.isNaN(precio_litro) || precio_litro <= 0) {
    return res.status(400).json({ success: false, message: 'Indique el precio por litro de esta semana.' });
  }
  if (Number.isNaN(precio_litro_acida) || precio_litro_acida < 0) {
    return res.status(400).json({ success: false, message: 'El precio de la leche ácida no es válido.' });
  }
  if (Number.isNaN(precio_litro_bajo_grasa) || precio_litro_bajo_grasa < 0) {
    return res.status(400).json({ success: false, message: 'El precio de la leche baja en grasa no es válido.' });
  }
  if (!Array.isArray(dias) || dias.length === 0) {
    return res.status(400).json({ success: false, message: 'No llegaron los días de la semana.' });
  }

  // ¿Hay algo real que guardar? Si no, no se crea ninguna semana: es lo que
  // llenaba el historial de filas en cero.
  const hayLitros = dias.some(
    (d) =>
      aNumero(d.litros, 0) > 0 || aNumero(d.litros_acidos, 0) > 0 || aNumero(d.litros_bajo_grasa, 0) > 0
  );

  let semana;
  try {
    // Aquí, y solo aquí, se crea o actualiza semanas_pago.
    semana = await confirmarSemana(productor, req.body, { permitirCrear: hayLitros });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    throw err;
  }

  const validas = new Set(rangoFechas(semana.fecha_inicio, semana.fecha_fin));
  const fuera = dias.find((d) => !validas.has(aTexto(d.fecha)));
  if (fuera) {
    return res.status(400).json({ success: false, message: 'Uno de los días no pertenece a esta semana.' });
  }

  const transaccion = await db.sequelize.transaction();
  try {
    for (const dia of dias) {
      const fecha = aTexto(dia.fecha);
      const litros = vacio(dia.litros) ? null : aNumero(dia.litros, NaN);
      const litros_acidos = vacio(dia.litros_acidos) ? 0 : aNumero(dia.litros_acidos, NaN);
      const litros_bajo_grasa = vacio(dia.litros_bajo_grasa) ? 0 : aNumero(dia.litros_bajo_grasa, NaN);

      const existente = await RegistroLecheProductor.findOne({
        where: { productor_id: productor.id, fecha },
        transaction: transaccion,
      });

      const sinNada = (litros === null || litros === 0) && litros_acidos === 0 && litros_bajo_grasa === 0;
      if (sinNada) {
        if (existente) await existente.destroy({ transaction: transaccion });
        continue;
      }

      if (litros !== null && (Number.isNaN(litros) || litros < 0)) {
        throw error400(`Litros inválidos en ${nombreDia(fecha)}.`);
      }
      if (Number.isNaN(litros_acidos) || litros_acidos < 0) {
        throw error400(`Litros ácidos inválidos en ${nombreDia(fecha)}.`);
      }
      if (Number.isNaN(litros_bajo_grasa) || litros_bajo_grasa < 0) {
        throw error400(`Litros bajos en grasa inválidos en ${nombreDia(fecha)}.`);
      }
      if (litros_acidos > 0 && precio_litro_acida <= 0) {
        throw error400(`Indique el precio de la leche ácida antes de cargar litros ácidos (${nombreDia(fecha)}).`);
      }
      if (litros_bajo_grasa > 0 && precio_litro_bajo_grasa <= 0) {
        throw error400(
          `Indique el precio de la leche baja en grasa antes de cargar esos litros (${nombreDia(fecha)}).`
        );
      }

      const valores = {
        litros: litros === null ? 0 : litros,
        litros_acidos,
        litros_bajo_grasa,
        precio_litro,
        precio_litro_acida,
        precio_litro_bajo_grasa,
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

  // Si el usuario borró todos los litros de una semana ya guardada, la
  // semana desaparece del historial en lugar de quedarse en cero.
  const quedan = await RegistroLecheProductor.count({ where: { semana_id: semana.id } });
  if (quedan === 0) {
    const inicio = aTexto(semana.fecha_inicio);
    const fin = aTexto(semana.fecha_fin);
    const dia_inicio = semana.dia_inicio;
    const dia_fin = semana.dia_fin;

    try {
      await borrarSemanaCompleta(semana);
    } catch (err) {
      // La semana la comparte otro módulo: se deja en pie, solo que sin
      // litros del productor. No es un error para quien está cargando.
      if (err.status !== 409) throw err;
      return res.json({
        success: true,
        message: 'La semana quedó sin litros. Se conserva porque la usa otro módulo.',
        data: await armarHoja(productor, semana),
      });
    }

    const hojaVacia = await armarHoja(
      productor,
      semanaVirtual({
        productor_id: productor.id,
        fechaInicioTexto: inicio,
        fechaFinTexto: fin,
        inicio: dia_inicio,
        fin: dia_fin,
      })
    );
    return res.json({
      success: true,
      message: 'La semana quedó sin litros y se quitó del historial.',
      data: hojaVacia,
    });
  }

  res.json({ success: true, message: 'Semana guardada.', data: await armarHoja(productor, semana) });
});

// @desc  Registrar el pago de una semana ya guardada.
// @route POST /api/registros-leche/hoja/pago
const registrarPago = asyncHandler(async (req, res) => {
  if (!PagoProductor) {
    return res.status(500).json({ success: false, message: 'Falta el modelo de pagos a productores.' });
  }

  const marcarPagado = req.body.marcar_pagado !== false;

  const productor = await Productor.findByPk(req.body.productor_id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  if (vacio(req.body.semana_id)) {
    return res.status(400).json({ success: false, message: 'Guarde la semana antes de registrar el pago.' });
  }

  const semana = await SemanaPago.findByPk(req.body.semana_id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });

  const hoja = await armarHoja(productor, semana);
  if (hoja.totales.total_pagar <= 0) {
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

  // Pagada = cerrada. Así, al volver a consultarla, aparece exactamente
  // como quedó y nadie la modifica sin reabrirla a propósito.
  if (marcarPagado && semana.estado !== 'cerrada') await semana.update({ estado: 'cerrada' });

  res.json({ success: true, message: marcarPagado ? 'Pago registrado.' : 'Pago pendiente.', data: pago });
});

// @desc  Semanas anteriores de un productor, paginadas.
// @route GET /api/registros-leche/historial?productor_id=&pagina=1&por_pagina=10
const historial = asyncHandler(async (req, res) => {
  const productor = await Productor.findByPk(req.query.productor_id);
  if (!productor) return res.status(404).json({ success: false, message: 'Productor no encontrado.' });

  const pagina = Math.max(1, aNumero(req.query.pagina, 1));
  const porPagina = Math.min(50, Math.max(1, aNumero(req.query.por_pagina, 10)));

  const { rows: semanas, count: total } = await SemanaPago.findAndCountAll({
    where: { productor_id: productor.id },
    order: [['fecha_inicio', 'DESC']],
    limit: porPagina,
    offset: (pagina - 1) * porPagina,
  });

  const idsSemanas = semanas.map((s) => s.id);

  const registros = idsSemanas.length
    ? await RegistroLecheProductor.findAll({ where: { productor_id: productor.id, semana_id: idsSemanas } })
    : [];

  const pagos =
    PagoProductor && idsSemanas.length
      ? await PagoProductor.findAll({ where: { productor_id: productor.id, semana_id: idsSemanas } })
      : [];

  const semanasData = semanas.map((s) => {
    const propios = registros.filter((r) => Number(r.semana_id) === Number(s.id));
    const pago = pagos.find((p) => Number(p.semana_id) === Number(s.id));
    return {
      id: s.id,
      estado: s.estado,
      fecha_inicio: aTexto(s.fecha_inicio),
      fecha_fin: aTexto(s.fecha_fin),
      dia_inicio: s.dia_inicio,
      dia_fin: s.dia_fin,
      etiqueta: etiquetaDias(s.dia_inicio, s.dia_fin),
      dias_con_leche: propios.length,
      // Marca las filas que no aportan nada, para poder limpiarlas.
      vacia: propios.length === 0,
      total_litros: redondear(propios.reduce((acc, r) => acc + Number(r.litros), 0)),
      total_litros_acidos: redondear(propios.reduce((acc, r) => acc + Number(r.litros_acidos || 0), 0)),
      total_litros_bajo_grasa: redondear(propios.reduce((acc, r) => acc + Number(r.litros_bajo_grasa || 0), 0)),
      total_pagar_normal: redondear(
        propios.reduce((acc, r) => acc + Number(r.litros) * Number(r.precio_litro || 0), 0)
      ),
      total_pagar_acida: redondear(
        propios.reduce((acc, r) => acc + Number(r.litros_acidos || 0) * Number(r.precio_litro_acida || 0), 0)
      ),
      total_pagar_bajo_grasa: redondear(
        propios.reduce(
          (acc, r) => acc + Number(r.litros_bajo_grasa || 0) * Number(r.precio_litro_bajo_grasa || 0),
          0
        )
      ),
      total_pagar: redondear(propios.reduce((acc, r) => acc + Number(r.subtotal || 0), 0)),
      moneda: propios[0]?.moneda || normalizarMoneda(productor.moneda, 'BS'),
      estado_pago: pago?.estado_pago || null,
      fecha_pago: pago?.fecha_pago || null,
    };
  });

  res.json({
    success: true,
    data: {
      semanas: semanasData,
      paginacion: {
        pagina,
        por_pagina: porPagina,
        total,
        total_paginas: Math.max(1, Math.ceil(total / porPagina)),
      },
    },
  });
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

// @desc  Borrar de golpe las semanas que no tienen un solo litro cargado.
//        Sirve para limpiar las que dejó la versión anterior del sistema.
// @route DELETE /api/registros-leche/semanas/vacias?productor_id=
// NOTA: debe declararse ANTES de la ruta /semanas/:id.
const limpiarSemanasVacias = asyncHandler(async (req, res) => {
  const where = {};
  if (!vacio(req.query.productor_id)) where.productor_id = Number(req.query.productor_id);

  const semanas = await SemanaPago.findAll({ where });
  if (semanas.length === 0) {
    return res.json({ success: true, message: 'No hay semanas para revisar.', data: { eliminadas: 0 } });
  }

  const ids = semanas.map((s) => s.id);
  const conLitros = await RegistroLecheProductor.findAll({
    where: { semana_id: ids },
    attributes: ['semana_id'],
    group: ['semana_id'],
  });
  const ocupadas = new Set(conLitros.map((r) => Number(r.semana_id)));

  const candidatas = semanas.filter((s) => !ocupadas.has(Number(s.id)));

  let eliminadas = 0;
  const conservadas = [];
  for (const semana of candidatas) {
    try {
      await borrarSemanaCompleta(semana);
      eliminadas += 1;
    } catch (err) {
      // Semana compartida con ruteros u otro módulo: se respeta.
      if (err.status !== 409) throw err;
      conservadas.push(`${aTexto(semana.fecha_inicio)} a ${aTexto(semana.fecha_fin)}`);
    }
  }

  const partes = [];
  if (eliminadas > 0) partes.push(`Se eliminaron ${eliminadas} semana(s) sin litros cargados.`);
  if (conservadas.length > 0) {
    partes.push(
      `Se conservaron ${conservadas.length} porque las usa otro módulo (${conservadas.slice(0, 3).join('; ')}${
        conservadas.length > 3 ? '…' : ''
      }).`
    );
  }
  if (partes.length === 0) partes.push('No había semanas vacías.');

  res.json({
    success: true,
    message: partes.join(' '),
    data: { eliminadas, conservadas: conservadas.length },
  });
});

// @desc  Eliminar una semana concreta con sus días y su pago.
// @route DELETE /api/registros-leche/semanas/:id?forzar=true
const eliminarSemana = asyncHandler(async (req, res) => {
  const semana = await SemanaPago.findByPk(req.params.id);
  if (!semana) return res.status(404).json({ success: false, message: 'Semana no encontrada.' });

  const forzar = String(req.query.forzar || '') === 'true';

  // Primero: ¿la comparte otro módulo? Eso no se salta ni con forzar.
  const usos = await usosAjenos(semana.id);
  if (usos.length > 0) {
    return res.status(409).json({
      success: false,
      message: `No se puede eliminar esta semana porque la está usando el ${textoUsos(usos)}. Borre primero esos registros desde su módulo.`,
      data: { compartida: true, usos },
    });
  }

  const pago = PagoProductor
    ? await PagoProductor.findOne({ where: { semana_id: semana.id } })
    : null;

  if (pago && pago.estado_pago === 'pagado' && !forzar) {
    return res.status(409).json({
      success: false,
      message: 'Esta semana ya tiene un pago registrado. Confirme que quiere borrarla junto con su pago.',
      data: { requiere_confirmacion: true },
    });
  }

  try {
    await borrarSemanaCompleta(semana);
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ success: false, message: err.message });
    throw err;
  }

  res.json({ success: true, message: 'Semana eliminada del historial.' });
});

// ============================================================
//  RESUMEN DE LA SEMANA (todos los productores de un rango)
//
//  Solo lectura: no crea ni modifica semanas_pago.
//
//  A diferencia de /hoja (que va de a un productor), aqui se parte del
//  rango de fechas y se agrupan los registros que caen dentro. Un
//  productor aparece si tiene al menos un litro cargado en ese rango,
//  sin importar como tenga configurada su propia semana.
// ============================================================

// Tope de seguridad: sin esto, un rango de dos años traeria decenas de
// miles de filas a memoria para agruparlas en JS.
const MAX_DIAS_RESUMEN = 92;

// @desc  Productores con litros cargados en un rango, con sus totales.
// @route GET /api/registros-leche/resumen-semana?fecha_inicio=&fecha_fin=
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

  const registros = await RegistroLecheProductor.findAll({
    where: { fecha: { [Op.between]: [desde, hasta] } },
    include: [incluirProductor],
    order: [
      ['productor_id', 'ASC'],
      ['fecha', 'ASC'],
    ],
  });

  // ---- Agrupar por productor ----
  const porProductor = new Map();

  registros.forEach((r) => {
    const litros = aNumero(r.litros, 0);
    const acidos = aNumero(r.litros_acidos, 0);
    const bajoGrasa = aNumero(r.litros_bajo_grasa, 0);

    // Un día sin un solo litro no cuenta como "cargado".
    if (litros <= 0 && acidos <= 0 && bajoGrasa <= 0) return;

    const id = Number(r.productor_id);
    if (!porProductor.has(id)) {
      const p = r.Productor;
      porProductor.set(id, {
        productor_id: id,
        nombre: p?.nombre || `Productor ${id}`,
        color_identificativo: p?.color_identificativo || null,
        moneda: normalizarMoneda(p?.moneda, 'BS'),
        monedas: new Set(),
        semanas: new Set(),
        dias_con_leche: 0,
        primera_fecha: aTexto(r.fecha),
        ultima_fecha: aTexto(r.fecha),
        total_litros: 0,
        total_litros_acidos: 0,
        total_litros_bajo_grasa: 0,
        total_pagar_normal: 0,
        total_pagar_acida: 0,
        total_pagar_bajo_grasa: 0,
        total_pagar: 0,
        precio_litro: 0,
        precio_litro_acida: 0,
        precio_litro_bajo_grasa: 0,
      });
    }

    const fila = porProductor.get(id);
    const moneda = normalizarMoneda(r.moneda, fila.moneda);

    fila.dias_con_leche += 1;
    fila.ultima_fecha = aTexto(r.fecha);
    fila.monedas.add(moneda);
    if (r.semana_id) fila.semanas.add(Number(r.semana_id));

    fila.total_litros += litros;
    fila.total_litros_acidos += acidos;
    fila.total_litros_bajo_grasa += bajoGrasa;
    fila.total_pagar_normal += litros * aNumero(r.precio_litro, 0);
    fila.total_pagar_acida += acidos * aNumero(r.precio_litro_acida, 0);
    fila.total_pagar_bajo_grasa += bajoGrasa * aNumero(r.precio_litro_bajo_grasa, 0);
    fila.total_pagar += aNumero(r.subtotal, 0);

    // Los registros vienen ordenados por fecha: el último día cargado
    // manda, igual que en la hoja individual.
    fila.moneda = moneda;
    fila.precio_litro = aNumero(r.precio_litro, 0);
    fila.precio_litro_acida = aNumero(r.precio_litro_acida, 0);
    fila.precio_litro_bajo_grasa = aNumero(r.precio_litro_bajo_grasa, 0);
  });

  // ---- Estado de pago (una sola consulta para todas las semanas) ----
  const idsSemanas = [...new Set([...porProductor.values()].flatMap((f) => [...f.semanas]))];

  const pagos =
    PagoProductor && idsSemanas.length
      ? await PagoProductor.findAll({ where: { semana_id: idsSemanas } })
      : [];

  const semanas = idsSemanas.length
    ? await SemanaPago.findAll({ where: { id: idsSemanas } })
    : [];

  const estadoSemana = new Map(semanas.map((s) => [Number(s.id), s.estado]));

  // ---- Armar la respuesta ----
  const productores = [...porProductor.values()]
    .map((f) => {
      const listaSemanas = [...f.semanas];
      // Solo tiene sentido hablar de "la" semana si todos los días del
      // rango cayeron dentro de la misma semana guardada.
      const semanaId = listaSemanas.length === 1 ? listaSemanas[0] : null;
      const pago = semanaId ? pagos.find((p) => Number(p.productor_id) === f.productor_id && Number(p.semana_id) === semanaId) : null;

      return {
        productor_id: f.productor_id,
        nombre: f.nombre,
        color_identificativo: f.color_identificativo,
        moneda: f.moneda,
        // Aviso para la pantalla: este productor cambió de moneda a mitad
        // del rango, así que su total no se puede leer de corrido.
        monedas_mezcladas: f.monedas.size > 1,
        semana_id: semanaId,
        semanas_ids: listaSemanas,
        estado_semana: semanaId ? estadoSemana.get(semanaId) || null : null,
        estado_pago: pago?.estado_pago || null,
        fecha_pago: pago?.fecha_pago || null,
        guardado: listaSemanas.length > 0,
        dias_con_leche: f.dias_con_leche,
        primera_fecha: f.primera_fecha,
        ultima_fecha: f.ultima_fecha,
        precio_litro: redondear(f.precio_litro),
        precio_litro_acida: redondear(f.precio_litro_acida),
        precio_litro_bajo_grasa: redondear(f.precio_litro_bajo_grasa),
        total_litros: redondear(f.total_litros),
        total_litros_acidos: redondear(f.total_litros_acidos),
        total_litros_bajo_grasa: redondear(f.total_litros_bajo_grasa),
        total_pagar_normal: redondear(f.total_pagar_normal),
        total_pagar_acida: redondear(f.total_pagar_acida),
        total_pagar_bajo_grasa: redondear(f.total_pagar_bajo_grasa),
        total_pagar: redondear(f.total_pagar),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  // ---- Totales por moneda ----
  // El dinero NO se suma entre monedas: BS va por su lado y USD por el
  // suyo. Los litros sí se pueden sumar todos juntos.
  const porMoneda = new Map();
  productores.forEach((p) => {
    if (!porMoneda.has(p.moneda)) {
      porMoneda.set(p.moneda, {
        moneda: p.moneda,
        productores: 0,
        total_litros: 0,
        total_litros_acidos: 0,
        total_litros_bajo_grasa: 0,
        total_pagar_normal: 0,
        total_pagar_acida: 0,
        total_pagar_bajo_grasa: 0,
        total_pagar: 0,
      });
    }
    const t = porMoneda.get(p.moneda);
    t.productores += 1;
    t.total_litros += p.total_litros;
    t.total_litros_acidos += p.total_litros_acidos;
    t.total_litros_bajo_grasa += p.total_litros_bajo_grasa;
    t.total_pagar_normal += p.total_pagar_normal;
    t.total_pagar_acida += p.total_pagar_acida;
    t.total_pagar_bajo_grasa += p.total_pagar_bajo_grasa;
    t.total_pagar += p.total_pagar;
  });

  const totalesPorMoneda = [...porMoneda.values()]
    .map((t) => ({
      ...t,
      total_litros: redondear(t.total_litros),
      total_litros_acidos: redondear(t.total_litros_acidos),
      total_litros_bajo_grasa: redondear(t.total_litros_bajo_grasa),
      total_pagar_normal: redondear(t.total_pagar_normal),
      total_pagar_acida: redondear(t.total_pagar_acida),
      total_pagar_bajo_grasa: redondear(t.total_pagar_bajo_grasa),
      total_pagar: redondear(t.total_pagar),
    }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda));

  res.json({
    success: true,
    data: {
      rango: {
        fecha_inicio: desde,
        fecha_fin: hasta,
        dias: fechas.length,
      },
      productores,
      totales_por_moneda: totalesPorMoneda,
      totales: {
        productores: productores.length,
        total_litros: redondear(productores.reduce((s, p) => s + p.total_litros, 0)),
        total_litros_acidos: redondear(productores.reduce((s, p) => s + p.total_litros_acidos, 0)),
        total_litros_bajo_grasa: redondear(productores.reduce((s, p) => s + p.total_litros_bajo_grasa, 0)),
      },
    },
  });
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

// ---------- Rutas ----------
router.use(proteger);

// La hoja se pide de tres formas:
//   - semana_id: reabrir una semana del historial, tal cual quedó guardada.
//   - fecha_inicio + fecha_fin: rango exacto (lo usa la impresión, para
//     traer el mismo tramo de días de varios productores).
//   - fecha_inicio + dia_fin: lo que arma la pantalla al elegir fechas.
router.get(
  '/hoja',
  [
    query('productor_id').isInt().withMessage('Seleccione un productor'),
    query('dia_inicio').optional().isInt({ min: 0, max: 6 }).withMessage('Día de inicio inválido'),
    query('dia_fin').optional().isInt({ min: 0, max: 6 }).withMessage('Día de cierre inválido'),
    query('fecha_inicio').optional().isISO8601().withMessage('Fecha de inicio inválida'),
    query('fecha_fin').optional().isISO8601().withMessage('Fecha de cierre inválida'),
    query('semana_id').optional().isInt(),
  ],
  validar,
  obtenerHoja
);

router.post(
  '/hoja',
  [
    body('productor_id').isInt().withMessage('Seleccione un productor'),
    // O bien semana_id (editar una guardada), o bien fecha_inicio + dia_fin
    // (crear/actualizar). El controlador valida la combinación exacta.
    body('semana_id').optional({ nullable: true }).isInt().withMessage('Semana inválida'),
    body('fecha_inicio').optional({ nullable: true }).isISO8601().withMessage('Fecha de inicio inválida'),
    body('dia_inicio').optional({ nullable: true }).isInt({ min: 0, max: 6 }).withMessage('Día de inicio inválido'),
    body('dia_fin').optional({ nullable: true }).isInt({ min: 0, max: 6 }).withMessage('Día de cierre inválido'),
    body('precio_litro').isFloat({ gt: 0 }).withMessage('El precio por litro debe ser mayor a 0'),
    body('precio_litro_acida')
      .optional({ nullable: true })
      .isFloat({ min: 0 })
      .withMessage('El precio de la leche ácida debe ser mayor o igual a 0'),
    body('precio_litro_bajo_grasa')
      .optional({ nullable: true })
      .isFloat({ min: 0 })
      .withMessage('El precio de la leche baja en grasa debe ser mayor o igual a 0'),
    body('moneda').optional().customSanitizer((v) => String(v || '').toUpperCase()).isIn(MONEDAS),
    body('dias').isArray({ min: 1 }).withMessage('Faltan los días de la semana'),
  ],
  validar,
  guardarHoja
);

router.post(
  '/hoja/pago',
  permitirRoles('admin', 'contabilidad'),
  [body('productor_id').isInt(), body('semana_id').isInt()],
  validar,
  registrarPago
);

router.get(
  '/historial',
  [
    query('productor_id').isInt(),
    query('pagina').optional().isInt({ min: 1 }),
    query('por_pagina').optional().isInt({ min: 1, max: 50 }),
  ],
  validar,
  historial
);

router.patch('/semanas/:id/estado', [param('id').isInt()], validar, cambiarEstadoSemana);

// '/semanas/vacias' va ANTES de '/semanas/:id': si no, Express intenta
// leer "vacias" como un id.
router.delete(
  '/semanas/vacias',
  permitirRoles('admin', 'contabilidad'),
  [query('productor_id').optional().isInt()],
  validar,
  limpiarSemanasVacias
);

router.delete(
  '/semanas/:id',
  permitirRoles('admin', 'contabilidad'),
  [param('id').isInt(), query('forzar').optional().isIn(['true', 'false'])],
  validar,
  eliminarSemana
);

// Resumen de la semana: todos los productores de un rango de fechas.
router.get(
  '/resumen-semana',
  [
    query('fecha_inicio').isISO8601().withMessage('Fecha de inicio inválida'),
    query('fecha_fin').isISO8601().withMessage('Fecha de cierre inválida'),
  ],
  validar,
  resumenSemana
);

router.get('/', listar);
router.delete('/:id', permitirRoles('admin', 'contabilidad'), [param('id').isInt()], validar, eliminar);

module.exports = router;