const { CompraProveedor, Proveedor, Insumo } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// @desc  Listar compras (filtrable por proveedor)
// @route GET /api/compras-proveedores?proveedor_id=
const listar = asyncHandler(async (req, res) => {
  const { proveedor_id } = req.query;
  const where = {};
  if (proveedor_id) where.proveedor_id = proveedor_id;

  const compras = await CompraProveedor.findAll({
    where,
    include: [
      { model: Proveedor, attributes: ['id', 'nombre'] },
      { model: Insumo, attributes: ['id', 'nombre', 'unidad_medida'] },
    ],
    order: [['fecha', 'DESC']],
  });

  res.json({ success: true, data: compras });
});

// @desc  Registrar una compra a un proveedor (ej. sacos de sal)
// @route POST /api/compras-proveedores
const crear = asyncHandler(async (req, res) => {
  const { proveedor_id, insumo_id, fecha, cantidad, costo_unitario, observaciones } = req.body;

  const proveedor = await Proveedor.findByPk(proveedor_id);
  if (!proveedor) {
    return res.status(404).json({ success: false, message: 'Proveedor no encontrado.' });
  }

  const compra = await CompraProveedor.create({
    proveedor_id,
    insumo_id,
    fecha,
    cantidad,
    costo_unitario,
    observaciones,
  });

  // Si la compra esta asociada a un insumo, aumenta su stock actual.
  if (insumo_id) {
    const insumo = await Insumo.findByPk(insumo_id);
    if (insumo) {
      await insumo.update({ stock_actual: parseFloat(insumo.stock_actual) + parseFloat(cantidad) });
    }
  }

  res.status(201).json({ success: true, data: compra });
});

module.exports = { listar, crear };
