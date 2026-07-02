const { Producto } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const { activo } = req.query;
  const where = {};
  if (activo !== undefined) where.activo = activo === 'true';

  const productos = await Producto.findAll({ where, order: [['nombre', 'ASC']] });
  res.json({ success: true, data: productos });
});

const obtener = asyncHandler(async (req, res) => {
  const producto = await Producto.findByPk(req.params.id);
  if (!producto) {
    return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
  }
  res.json({ success: true, data: producto });
});

const crear = asyncHandler(async (req, res) => {
  const { nombre, descripcion, unidad_medida, precio_venta } = req.body;
  const producto = await Producto.create({ nombre, descripcion, unidad_medida, precio_venta });
  res.status(201).json({ success: true, data: producto });
});

const actualizar = asyncHandler(async (req, res) => {
  const producto = await Producto.findByPk(req.params.id);
  if (!producto) {
    return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
  }

  await producto.update(req.body);
  res.json({ success: true, data: producto });
});

const eliminar = asyncHandler(async (req, res) => {
  const producto = await Producto.findByPk(req.params.id);
  if (!producto) {
    return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
  }

  await producto.update({ activo: false });
  res.json({ success: true, message: 'Producto desactivado correctamente.' });
});

module.exports = { listar, obtener, crear, actualizar, eliminar };
