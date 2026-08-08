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

    const cantidad = Number(datos.cantidad);
    if (Number.isNaN(cantidad) || cantidad <= 0) {
      throw new ErrorDeNegocio('La cantidad debe ser un número mayor a 0.');
    }

    if (tipo === 'entrada' && (vacio(datos.precio_unitario) || vacio(datos.moneda))) {
      throw new ErrorDeNegocio('Las entradas necesitan precio unitario y moneda.');
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
        precio_unitario: vacio(datos.precio_unitario) ? null : Number(datos.precio_unitario),
        moneda: vacio(datos.moneda) ? null : String(datos.moneda).toUpperCase(),
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
