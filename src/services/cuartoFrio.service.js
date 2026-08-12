const { MovimientoCuartoFrio, sequelize } = require('../models');
const { ErrorDeNegocio } = require('./insumos.service');

/**
 * Cuarto frio: inventario de producto terminado.
 *
 * No hay tabla de saldos. La existencia de cada producto es
 * SUM(kilos * signo) sobre sus movimientos, asi que el inventario no
 * puede quedar desincronizado de su propio historial.
 *
 * Las correcciones nunca borran: se registra el mismo tipo de movimiento
 * con el signo invertido. De esa forma queda el rastro de que un lote se
 * anulo, en vez de que simplemente desaparezca del libro.
 */

const redondearKg = (n) => Number(Number(n || 0).toFixed(3));
const aEntero = (n) => (n === null || n === undefined || n === '' ? null : Number.parseInt(n, 10) || 0);

/**
 * Existencia por producto. Devuelve un Map producto -> { kilos, piezas }.
 * Se calcula en la base de datos, no trayendo todas las filas.
 */
const existenciaPorProducto = async (transaction = null) => {
  const filas = await MovimientoCuartoFrio.findAll({
    attributes: [
      'producto',
      [sequelize.literal('SUM(kilos * signo)'), 'kilos'],
      [sequelize.literal('SUM(COALESCE(piezas, 0) * signo)'), 'piezas'],
    ],
    group: ['producto'],
    raw: true,
    transaction,
  });

  const mapa = new Map();
  filas.forEach((f) => {
    mapa.set(f.producto, {
      producto: f.producto,
      kilos: redondearKg(f.kilos),
      piezas: Number(f.piezas) || 0,
    });
  });
  return mapa;
};

/** Existencia de UN producto, con bloqueo opcional para descontar seguro. */
const existenciaDe = async (producto, transaction = null) => {
  const fila = await MovimientoCuartoFrio.findAll({
    attributes: [
      [sequelize.literal('SUM(kilos * signo)'), 'kilos'],
      [sequelize.literal('SUM(COALESCE(piezas, 0) * signo)'), 'piezas'],
    ],
    where: { producto },
    raw: true,
    transaction,
  });

  return {
    producto,
    kilos: redondearKg(fila?.[0]?.kilos),
    piezas: Number(fila?.[0]?.piezas) || 0,
  };
};

/**
 * Entrada automatica de un lote recien producido.
 * La llama produccion.js dentro de su propia transaccion.
 */
const registrarProduccion = async (lote, transaction) => {
  const kilos = Number(lote.kilos_obtenidos);
  if (!kilos || kilos <= 0) return null;

  return MovimientoCuartoFrio.create(
    {
      fecha: lote.fecha,
      producto: lote.producto,
      tipo: 'produccion',
      signo: 1,
      kilos: redondearKg(kilos),
      piezas: aEntero(lote.cantidad_unidades),
      lote_produccion_id: lote.id,
      descripcion: `Lote #${lote.id}`,
    },
    { transaction }
  );
};

/**
 * Deshace lo que este lote metio al cuarto frio. Igual que con los
 * insumos, el saldo es (lo que entro - lo que ya se devolvio), asi que
 * llamarlo dos veces no resta de mas.
 */
const revertirProduccion = async (lote, transaction) => {
  const movimientos = await MovimientoCuartoFrio.findAll({
    where: { lote_produccion_id: lote.id, tipo: 'produccion' },
    transaction,
  });

  let kilos = 0;
  let piezas = 0;
  movimientos.forEach((m) => {
    kilos += Number(m.kilos) * m.signo;
    piezas += (Number(m.piezas) || 0) * m.signo;
  });

  if (redondearKg(kilos) <= 0) return null;

  return MovimientoCuartoFrio.create(
    {
      fecha: lote.fecha,
      producto: lote.producto,
      tipo: 'produccion',
      signo: -1,
      kilos: redondearKg(kilos),
      piezas: piezas > 0 ? piezas : null,
      lote_produccion_id: lote.id,
      descripcion: `Reversa del lote #${lote.id}`,
    },
    { transaction }
  );
};

/**
 * Quesos del cuarto frio que se van a fundir para hacer un lote nuevo.
 *
 * Valida TODO antes de descontar nada: si un producto no alcanza, el lote
 * entero se rechaza en vez de quedar medio aplicado.
 *
 * lineas: [{ producto, kilos, piezas }]
 */
const aplicarReproceso = async (lote, lineas, transaction) => {
  // Se juntan las lineas repetidas del mismo producto.
  const mapa = new Map();
  (lineas || []).forEach((l) => {
    const producto = String(l?.producto || '').trim();
    const kilos = Number(l?.kilos);
    if (!producto || Number.isNaN(kilos) || kilos <= 0) return;
    const previo = mapa.get(producto) || { producto, kilos: 0, piezas: 0 };
    previo.kilos = redondearKg(previo.kilos + kilos);
    previo.piezas += aEntero(l?.piezas) || 0;
    mapa.set(producto, previo);
  });

  const consumo = [...mapa.values()];
  if (consumo.length === 0) return [];

  const faltantes = [];
  for (const linea of consumo) {
    const disponible = await existenciaDe(linea.producto, transaction);
    if (linea.kilos > disponible.kilos) {
      faltantes.push(
        `${linea.producto}: hacen falta ${linea.kilos} kg y en cuarto frío solo hay ${disponible.kilos}`
      );
    }
  }

  if (faltantes.length > 0) {
    throw new ErrorDeNegocio(`No hay suficiente producto en cuarto frío. ${faltantes.join('; ')}.`);
  }

  const foto = [];
  for (const linea of consumo) {
    await MovimientoCuartoFrio.create(
      {
        fecha: lote.fecha,
        producto: linea.producto,
        tipo: 'reproceso',
        signo: -1,
        kilos: linea.kilos,
        piezas: linea.piezas > 0 ? linea.piezas : null,
        lote_produccion_id: lote.id,
        descripcion: `Reprocesado en ${lote.producto} — lote #${lote.id}`,
      },
      { transaction }
    );
    foto.push({ producto: linea.producto, kilos: linea.kilos, piezas: linea.piezas > 0 ? linea.piezas : null });
  }

  return foto;
};

/** Devuelve al cuarto frio los quesos que este lote habia reprocesado. */
const revertirReproceso = async (lote, transaction) => {
  const movimientos = await MovimientoCuartoFrio.findAll({
    where: { lote_produccion_id: lote.id, tipo: 'reproceso' },
    transaction,
  });

  const saldo = new Map();
  movimientos.forEach((m) => {
    const previo = saldo.get(m.producto) || { kilos: 0, piezas: 0 };
    // signo -1 en las salidas: el saldo pendiente de devolver es positivo.
    previo.kilos += Number(m.kilos) * -m.signo;
    previo.piezas += (Number(m.piezas) || 0) * -m.signo;
    saldo.set(m.producto, previo);
  });

  const devueltos = [];
  for (const [producto, valores] of saldo) {
    const kilos = redondearKg(valores.kilos);
    if (kilos <= 0) continue;

    await MovimientoCuartoFrio.create(
      {
        fecha: lote.fecha,
        producto,
        tipo: 'reproceso',
        signo: 1,
        kilos,
        piezas: valores.piezas > 0 ? valores.piezas : null,
        lote_produccion_id: lote.id,
        descripcion: `Devuelto al anular el lote #${lote.id}`,
      },
      { transaction }
    );
    devueltos.push({ producto, kilos });
  }

  return devueltos;
};

/**
 * Queso que vuelve de un cliente.
 *
 * Si no sirve para reprocesar se graban DOS movimientos: la devolucion
 * (para que quede el registro de que volvio) y el descarte que la saca
 * enseguida del inventario. Asi el reporte de devoluciones muestra todo
 * lo que volvio, y la existencia solo cuenta lo aprovechable.
 */
const registrarDevolucion = async (datos) => {
  const producto = String(datos.producto || '').trim();
  const kilos = Number(datos.kilos);
  const piezas = aEntero(datos.piezas);
  const apto = datos.apto_reproceso !== false && datos.apto_reproceso !== 'false';

  if (!producto) throw new ErrorDeNegocio('Indique qué producto fue devuelto.');
  if (Number.isNaN(kilos) || kilos <= 0) throw new ErrorDeNegocio('Los kilos devueltos deben ser mayores a 0.');

  return sequelize.transaction(async (transaction) => {
    const comun = {
      fecha: datos.fecha || undefined,
      producto,
      kilos: redondearKg(kilos),
      piezas,
      cliente: datos.cliente ? String(datos.cliente).trim() : null,
      motivo: datos.motivo ? String(datos.motivo).trim() : null,
    };

    const devolucion = await MovimientoCuartoFrio.create(
      { ...comun, tipo: 'devolucion', signo: 1, apto_reproceso: apto },
      { transaction }
    );

    let descarte = null;
    if (!apto) {
      descarte = await MovimientoCuartoFrio.create(
        {
          ...comun,
          tipo: 'descarte',
          signo: -1,
          apto_reproceso: false,
          descripcion: `Devolución #${devolucion.id} descartada`,
        },
        { transaction }
      );
    }

    return { devolucion, descarte };
  });
};

/** Deshace una devolucion (y su descarte, si lo tenia). */
const anularDevolucion = async (id) => {
  return sequelize.transaction(async (transaction) => {
    const devolucion = await MovimientoCuartoFrio.findByPk(id, { transaction });
    if (!devolucion) throw new ErrorDeNegocio('La devolución no existe.');
    if (devolucion.tipo !== 'devolucion') throw new ErrorDeNegocio('Ese movimiento no es una devolución.');

    // Si ya se uso para reprocesar, el inventario quedaria en negativo.
    if (devolucion.apto_reproceso) {
      const disponible = await existenciaDe(devolucion.producto, transaction);
      if (Number(devolucion.kilos) > disponible.kilos) {
        throw new ErrorDeNegocio(
          `No se puede anular: quedan ${disponible.kilos} kg de ${devolucion.producto} y la devolución era de ${Number(devolucion.kilos)} kg. Ya se usó.`
        );
      }
    }

    await MovimientoCuartoFrio.create(
      {
        fecha: devolucion.fecha,
        producto: devolucion.producto,
        tipo: 'devolucion',
        signo: -1,
        kilos: devolucion.kilos,
        piezas: devolucion.piezas,
        cliente: devolucion.cliente,
        apto_reproceso: devolucion.apto_reproceso,
        descripcion: `Anulación de la devolución #${devolucion.id}`,
      },
      { transaction }
    );

    // Si estaba descartada, tambien se revierte el descarte.
    if (!devolucion.apto_reproceso) {
      await MovimientoCuartoFrio.create(
        {
          fecha: devolucion.fecha,
          producto: devolucion.producto,
          tipo: 'descarte',
          signo: 1,
          kilos: devolucion.kilos,
          piezas: devolucion.piezas,
          descripcion: `Anulación del descarte de la devolución #${devolucion.id}`,
        },
        { transaction }
      );
    }

    return { anulada: devolucion.id };
  });
};

module.exports = {
  existenciaPorProducto,
  existenciaDe,
  registrarProduccion,
  revertirProduccion,
  aplicarReproceso,
  revertirReproceso,
  registrarDevolucion,
  anularDevolucion,
};
