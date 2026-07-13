const { Productor } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// @desc  Listar todos los productores (por defecto solo activos)
// @route GET /api/productores?activo=true
const listar = asyncHandler(async (req, res) => {
  const { activo } = req.query;
  const where = {};
  if (activo !== undefined) where.activo = activo === 'true';

  const productores = await Productor.findAll({ where, order: [['nombre', 'ASC']] });
  res.json({ success: true, data: productores });
});

// @desc  Obtener un productor por id
// @route GET /api/productores/:id
const obtener = asyncHandler(async (req, res) => {
  const productor = await Productor.findByPk(req.params.id);
  if (!productor) {
    return res.status(404).json({ success: false, message: 'Productor no encontrado.' });
  }
  res.json({ success: true, data: productor });
});

// @desc  Crear un productor
// @route POST /api/productores
const crear = asyncHandler(async (req, res) => {
  const { nombre, color_identificativo, telefono, direccion, precio_litro_base, moneda } = req.body;

  const productor = await Productor.create({
    nombre,
    color_identificativo,
    telefono,
    direccion,
    precio_litro_base,
    moneda: moneda || 'BOB',
  });

  res.status(201).json({ success: true, data: productor });
});

// @desc  Actualizar un productor
// @route PUT /api/productores/:id
const actualizar = asyncHandler(async (req, res) => {
  const productor = await Productor.findByPk(req.params.id);
  if (!productor) {
    return res.status(404).json({ success: false, message: 'Productor no encontrado.' });
  }

  await productor.update(req.body);
  res.json({ success: true, data: productor });
});

// @desc  Desactivar (soft delete) un productor
// @route DELETE /api/productores/:id
const eliminar = asyncHandler(async (req, res) => {
  const productor = await Productor.findByPk(req.params.id);
  if (!productor) {
    return res.status(404).json({ success: false, message: 'Productor no encontrado.' });
  }

  await productor.update({ activo: false });
  res.json({ success: true, message: 'Productor desactivado correctamente.' });
});

module.exports = { listar, obtener, crear, actualizar, eliminar };