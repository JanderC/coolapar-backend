const { Insumo, MovimientoInsumo, sequelize } = require('../models');

/**
 * Error de negocio (stock insuficiente, insumo inactivo, etc.) — distinto
 * de un error de programación. La ruta lo atrapa y responde 400 en vez de
 * dejar que asyncHandler lo trate como un 500.
 */
class ErrorDeNegocio extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDeNegocio';
    this.esErrorDeNegocio = true;
  }
}

const vacio = (v) => v === undefined || v === null || v === '';

/**
 * Registra un movimiento de kardex (entrada o salida) y ajusta el stock
 * del insumo de forma atómica: si algo falla, no se guarda ni el
 * movimiento ni el cambio de stock. El bloqueo de fila (FOR UPDATE) evita
 * que dos movimientos simultáneos del mismo insumo se pisen el stock.
 */
const registrarMovimiento = async (insumoId, datos) => {
  return sequelize.transaction(async (transaction) => {
    const insumo = await Insumo.findByPk(insumoId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!insumo) throw new ErrorDeNegocio('El insumo no existe.');
    if (!insumo.activo) throw new ErrorDeNegocio('El insumo está inactivo.');

    const tipo = datos.tipo;
    if (!['entrada', 'salida'].includes(tipo)) {
      throw new ErrorDeNegocio("El tipo de movimiento debe ser 'entrada' o 'salida'.");
    }

    const cantidadIngresada = Number(datos.cantidad);
    if (Number.isNaN(cantidadIngresada) || cantidadIngresada <= 0) {
      throw new ErrorDeNegocio('La cantidad debe ser un número mayor a 0.');
    }

    // Si la compra se anotó en la unidad de compra del insumo (ej. "1
    // pote") en vez de la unidad base del inventario, se convierte acá
    // ANTES de tocar el stock. De ahí para abajo todo sigue trabajando
    // en la unidad base, exactamente igual que siempre: la conversión es
    // invisible para el resto del sistema.
    const enUnidadCompra =
      tipo === 'entrada' && (datos.en_unidad_compra === true || datos.en_unidad_compra === 'true');

    let cantidad = cantidadIngresada;
    let cantidadOriginal = null;
    let unidadOriginal = null;
    let precioUnitarioIngresado = datos.precio_unitario;

    if (enUnidadCompra) {
      if (!insumo.unidad_compra || vacio(insumo.factor_conversion)) {
        throw new ErrorDeNegocio('Este insumo no tiene configurada una unidad de compra con su factor de conversión.');
      }
      const factor = Number(insumo.factor_conversion);
      cantidad = Number((cantidadIngresada * factor).toFixed(2));
      cantidadOriginal = cantidadIngresada;
      unidadOriginal = insumo.unidad_compra;

      // El precio también se anota "por unidad de compra" (ej. "pagué
      // $50 por el pote"), que es como lo piensa quien compra. Se
      // convierte a precio por unidad base para que el resto de los
      // cálculos de costo (que siempre trabajan en la unidad base) no
      // se enteren de la diferencia.
      if (!vacio(precioUnitarioIngresado)) {
        precioUnitarioIngresado = Number((Number(precioUnitarioIngresado) / factor).toFixed(4));
      }
    }

    // Una COMPRA necesita precio y moneda: sin eso no se puede saber
    // cuanto se gasto en insumos.
    //
    // Un AJUSTE no: es la carga inicial del deposito o una correccion
    // contra un conteo fisico, y ahi no hay factura que valga. Se
    // distinguen por el precio: los movimientos sin precio no cuentan
    // como compras en el libro de caja (ver caja.service.js, que filtra
    // por precio_unitario distinto de null).
    const esAjuste = datos.es_ajuste === true || datos.es_ajuste === 'true';

    if (tipo === 'entrada' && !esAjuste && (vacio(datos.precio_unitario) || vacio(datos.moneda))) {
      throw new ErrorDeNegocio('Las compras necesitan precio unitario y moneda. Si es una carga inicial o un ajuste, márquelo como tal.');
    }

    const stockActual = Number(insumo.stock_actual);
    let stockResultante;

    if (tipo === 'entrada') {
      stockResultante = Number((stockActual + cantidad).toFixed(2));
    } else {
      if (cantidad > stockActual) {
        throw new ErrorDeNegocio(`Stock insuficiente. Hay ${stockActual} ${insumo.unidad_medida} disponibles.`);
      }
      stockResultante = Number((stockActual - cantidad).toFixed(2));
    }

    const movimiento = await MovimientoInsumo.create(
      {
        insumo_id: insumo.id,
        tipo,
        cantidad,
        cantidad_original: cantidadOriginal,
        unidad_original: unidadOriginal,
        // En un ajuste el precio se descarta aunque venga: lo que define
        // a una compra es tener precio, y un ajuste no lo es.
        precio_unitario: esAjuste || vacio(precioUnitarioIngresado) ? null : Number(precioUnitarioIngresado),
        moneda: esAjuste || vacio(datos.moneda) ? null : String(datos.moneda).toUpperCase(),
        fecha: datos.fecha || undefined,
        descripcion: vacio(datos.descripcion) ? null : String(datos.descripcion).trim(),
        stock_resultante: stockResultante,
      },
      { transaction }
    );

    await insumo.update({ stock_actual: stockResultante }, { transaction });

    return { movimiento, insumo, alertaStockMinimo: alertaStockMinimo(insumo) };
  });
};

/**
 * Anula un movimiento y revierte su efecto sobre el stock. Solo se puede
 * anular el movimiento MÁS RECIENTE de ese insumo — anular uno del medio
 * del historial dejaría el kardex con huecos que no cuadran.
 */
const anularMovimiento = async (movimientoId) => {
  return sequelize.transaction(async (transaction) => {
    const movimiento = await MovimientoInsumo.findByPk(movimientoId, { transaction });
    if (!movimiento) throw new ErrorDeNegocio('El movimiento no existe.');

    const insumo = await Insumo.findByPk(movimiento.insumo_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!insumo) throw new ErrorDeNegocio('El insumo no existe.');

    const masReciente = await MovimientoInsumo.findOne({
      where: { insumo_id: insumo.id },
      order: [['id', 'DESC']],
      transaction,
    });
    if (masReciente && masReciente.id !== movimiento.id) {
      throw new ErrorDeNegocio('Solo se puede anular el movimiento más reciente de este insumo.');
    }

    const cantidad = Number(movimiento.cantidad);
    const stockActual = Number(insumo.stock_actual);
    const stockRevertido =
      movimiento.tipo === 'entrada'
        ? Number((stockActual - cantidad).toFixed(2))
        : Number((stockActual + cantidad).toFixed(2));

    if (stockRevertido < 0) {
      throw new ErrorDeNegocio('No se puede anular: dejaría el stock en negativo.');
    }

    await insumo.update({ stock_actual: stockRevertido }, { transaction });
    await movimiento.destroy({ transaction });

    return { insumo };
  });
};

/** true si el stock actual ya cayó al mínimo o por debajo. */
const alertaStockMinimo = (insumo) =>
  insumo.stock_minimo !== null &&
  insumo.stock_minimo !== undefined &&
  Number(insumo.stock_actual) <= Number(insumo.stock_minimo);

module.exports = {
  ErrorDeNegocio,
  registrarMovimiento,
  anularMovimiento,
  alertaStockMinimo,
};