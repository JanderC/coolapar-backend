const { Insumo, MovimientoInsumo } = require('../models');
const { ErrorDeNegocio } = require('./insumos.service');

/**
 * Consumo de insumos de un lote de produccion.
 *
 * Por que no se reutiliza insumos.service.anularMovimiento para devolver:
 * ese metodo solo deja anular el movimiento MAS RECIENTE del insumo, y al
 * corregir un lote de la semana pasada casi siempre hay movimientos
 * posteriores. Aqui la devolucion se hace con un movimiento de reversa
 * (una entrada atada al mismo lote), que ademas deja el rastro de que
 * fue una correccion y no una compra.
 *
 * Todas las funciones reciben la transaccion desde afuera: el lote y sus
 * movimientos tienen que guardarse o fallar juntos.
 */

const redondear = (n) => Number(Number(n || 0).toFixed(2));

/**
 * Cuanto queda realmente consumido por este lote, insumo por insumo.
 * Es (salidas - devoluciones), asi que llamarlo dos veces no devuelve el
 * doble: la segunda vez el saldo ya es cero.
 */
const saldoDelLote = async (loteId, transaction) => {
  const movimientos = await MovimientoInsumo.findAll({
    where: { lote_produccion_id: loteId },
    transaction,
  });

  const saldo = new Map();
  movimientos.forEach((m) => {
    const signo = m.tipo === 'salida' ? 1 : -1;
    const acumulado = saldo.get(m.insumo_id) || 0;
    saldo.set(m.insumo_id, redondear(acumulado + signo * Number(m.cantidad)));
  });
  return saldo;
};

/**
 * Junta las lineas repetidas del mismo insumo y descarta las vacias.
 * Si alguien carga "Sal 2 kg" y mas abajo "Sal 1 kg", se consumen 3 kg.
 */
const consolidar = (lineas = []) => {
  const mapa = new Map();
  lineas.forEach((linea) => {
    const id = Number(linea?.insumo_id);
    const cantidad = Number(linea?.cantidad);
    if (!id || Number.isNaN(cantidad) || cantidad <= 0) return;
    mapa.set(id, redondear((mapa.get(id) || 0) + cantidad));
  });
  return [...mapa.entries()].map(([insumo_id, cantidad]) => ({ insumo_id, cantidad }));
};

/**
 * Descuenta del inventario lo que gasto el lote.
 *
 * Primero valida TODAS las lineas y solo despues toca el stock: si un
 * solo insumo no alcanza, no se consume ninguno. Asi no queda medio lote
 * aplicado cuando el usuario se equivoca en la ultima linea.
 *
 * Devuelve la foto de lo consumido, que se guarda en lotes_produccion.insumos_usados.
 */
const aplicarConsumo = async (lote, lineas, transaction) => {
  const consumo = consolidar(lineas);
  if (consumo.length === 0) return [];

  const preparados = [];
  const faltantes = [];

  for (const linea of consumo) {
    // El bloqueo de fila evita que dos lotes guardados a la vez lean el
    // mismo stock y lo dejen en negativo.
    const insumo = await Insumo.findByPk(linea.insumo_id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!insumo) throw new ErrorDeNegocio(`Uno de los insumos elegidos ya no existe (id ${linea.insumo_id}).`);
    if (!insumo.activo) throw new ErrorDeNegocio(`${insumo.nombre} está archivado: no se puede consumir.`);

    const disponible = Number(insumo.stock_actual);
    if (linea.cantidad > disponible) {
      faltantes.push(
        `${insumo.nombre}: hacen falta ${linea.cantidad} ${insumo.unidad_medida} y solo hay ${disponible}`
      );
    }
    preparados.push({ insumo, cantidad: linea.cantidad });
  }

  if (faltantes.length > 0) {
    throw new ErrorDeNegocio(`No hay existencia suficiente. ${faltantes.join('; ')}.`);
  }

  const foto = [];

  for (const { insumo, cantidad } of preparados) {
    const stockResultante = redondear(Number(insumo.stock_actual) - cantidad);

    await MovimientoInsumo.create(
      {
        insumo_id: insumo.id,
        lote_produccion_id: lote.id,
        tipo: 'salida',
        cantidad,
        precio_unitario: null,
        moneda: null,
        fecha: lote.fecha || undefined,
        descripcion: `Producción de ${lote.producto} — lote #${lote.id}`,
        stock_resultante: stockResultante,
      },
      { transaction }
    );

    await insumo.update({ stock_actual: stockResultante }, { transaction });

    // Se congela el nombre y la unidad tal como estaban: si el insumo se
    // renombra el año que viene, la formula de este lote se sigue
    // entendiendo.
    const precio = insumo.precio_unitario_referencia;
    foto.push({
      insumo_id: insumo.id,
      nombre: insumo.nombre,
      unidad_medida: insumo.unidad_medida,
      cantidad,
      precio_unitario_referencia: precio === null || precio === undefined ? null : Number(precio),
      moneda_referencia: insumo.moneda_referencia || null,
      costo_estimado: precio === null || precio === undefined ? null : redondear(Number(precio) * cantidad),
    });
  }

  return foto;
};

/**
 * Devuelve al inventario todo lo que este lote tenga consumido.
 * Se usa al corregir un lote (antes de aplicar la formula nueva) y al
 * anularlo.
 */
const revertirConsumo = async (lote, transaction) => {
  const saldo = await saldoDelLote(lote.id, transaction);
  const devueltos = [];

  for (const [insumoId, cantidad] of saldo) {
    if (cantidad <= 0) continue; // ya estaba devuelto

    const insumo = await Insumo.findByPk(insumoId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!insumo) continue; // el insumo desaparecio: no hay a donde devolverlo

    const stockResultante = redondear(Number(insumo.stock_actual) + cantidad);

    await MovimientoInsumo.create(
      {
        insumo_id: insumo.id,
        lote_produccion_id: lote.id,
        tipo: 'entrada',
        cantidad,
        // Sin precio: no es una compra, es lo que vuelve del lote.
        precio_unitario: null,
        moneda: null,
        descripcion: `Devolución del lote #${lote.id} (${lote.producto})`,
        stock_resultante: stockResultante,
      },
      { transaction }
    );

    await insumo.update({ stock_actual: stockResultante }, { transaction });
    devueltos.push({ insumo_id: insumo.id, nombre: insumo.nombre, cantidad });
  }

  return devueltos;
};

module.exports = {
  saldoDelLote,
  aplicarConsumo,
  revertirConsumo,
  consolidar,
};
