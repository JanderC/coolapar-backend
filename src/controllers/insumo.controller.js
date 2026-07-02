const { Insumo } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const insumos = await Insumo.findAll({ order: [['nombre', 'ASC']] });
  res.json({ success: true, data: insumos });
});

const obtener = asyncHandler(async (req, res) => {
  const insumo = await Insumo.findByPk(req.params.id);
  if (!insumo) {
    return res.status(404).json({ success: false, message: 'Insumo no encontrado.' });
  }
  res.json({ success: true, data: insumo });
});

// @desc  Crear un insumo (ej: sal), con su factor de uso por litro de leche
// @route POST /api/insumos
const crear = asyncHandler(async (req, res) => {
  const { nombre, unidad_medida, factor_por_litro, stock_actual, costo_unitario } = req.body;

  const insumo = await Insumo.create({
    nombre,
    unidad_medida,
    factor_por_litro,
    stock_actual,
    costo_unitario,
  });

  res.status(201).json({ success: true, data: insumo });
});

const actualizar = asyncHandler(async (req, res) => {
  const insumo = await Insumo.findByPk(req.params.id);
  if (!insumo) {
    return res.status(404).json({ success: false, message: 'Insumo no encontrado.' });
  }

  await insumo.update(req.body);
  res.json({ success: true, data: insumo });
});

const eliminar = asyncHandler(async (req, res) => {
  const insumo = await Insumo.findByPk(req.params.id);
  if (!insumo) {
    return res.status(404).json({ success: false, message: 'Insumo no encontrado.' });
  }

  await insumo.destroy();
  res.json({ success: true, message: 'Insumo eliminado correctamente.' });
});

module.exports = { listar, obtener, crear, actualizar, eliminar };
