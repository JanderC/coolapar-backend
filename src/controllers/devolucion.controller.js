const { Devolucion, Proveedor, Producto } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// @desc  Listar devoluciones (cosas aparte, no dependen de la produccion propia)
// @route GET /api/devoluciones
const listar = asyncHandler(async (req, res) => {
  const devoluciones = await Devolucion.findAll({
    include: [
      { model: Proveedor, attributes: ['id', 'nombre'] },
      { model: Producto, attributes: ['id', 'nombre'] },
    ],
    order: [['fecha', 'DESC']],
  });

  res.json({ success: true, data: devoluciones });
});

// @desc  Registrar una devolucion
// @route POST /api/devoluciones
const crear = asyncHandler(async (req, res) => {
  const { fecha, proveedor_id, producto_id, cantidad, motivo } = req.body;

  const devolucion = await Devolucion.create({
    fecha,
    proveedor_id,
    producto_id,
    cantidad,
    motivo,
  });

  res.status(201).json({ success: true, data: devolucion });
});

module.exports = { listar, crear };
