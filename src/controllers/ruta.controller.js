const { Ruta, Productor } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// @desc  Listar rutas (por defecto solo activas), con la cantidad de productores de cada una
// @route GET /api/rutas?activo=true
const listar = asyncHandler(async (req, res) => {
  const { activo } = req.query;
  const where = {};
  if (activo !== undefined) where.activo = activo === 'true';

  const rutas = await Ruta.findAll({
    where,
    include: [{ model: Productor, attributes: ['id', 'nombre'] }],
    order: [['nombre', 'ASC']],
  });

  res.json({ success: true, data: rutas });
});

// @desc  Obtener una ruta por id, con sus productores
// @route GET /api/rutas/:id
const obtener = asyncHandler(async (req, res) => {
  const ruta = await Ruta.findByPk(req.params.id, {
    include: [{ model: Productor }],
  });
  if (!ruta) {
    return res.status(404).json({ success: false, message: 'Ruta no encontrada.' });
  }
  res.json({ success: true, data: ruta });
});

// @desc  Crear una ruta/zona (con su color identificativo unico)
// @route POST /api/rutas
const crear = asyncHandler(async (req, res) => {
  const { nombre, color_identificativo, procedencia, descripcion } = req.body;

  const colorExistente = await Ruta.findOne({ where: { color_identificativo } });
  if (colorExistente) {
    return res.status(400).json({
      success: false,
      message: 'Ese color ya esta siendo usado por otra ruta. Elige un color distinto.',
    });
  }

  const ruta = await Ruta.create({ nombre, color_identificativo, procedencia, descripcion });
  res.status(201).json({ success: true, data: ruta });
});

// @desc  Actualizar una ruta
// @route PUT /api/rutas/:id
const actualizar = asyncHandler(async (req, res) => {
  const ruta = await Ruta.findByPk(req.params.id);
  if (!ruta) {
    return res.status(404).json({ success: false, message: 'Ruta no encontrada.' });
  }

  if (req.body.color_identificativo && req.body.color_identificativo !== ruta.color_identificativo) {
    const colorExistente = await Ruta.findOne({ where: { color_identificativo: req.body.color_identificativo } });
    if (colorExistente) {
      return res.status(400).json({
        success: false,
        message: 'Ese color ya esta siendo usado por otra ruta. Elige un color distinto.',
      });
    }
  }

  await ruta.update(req.body);
  res.json({ success: true, data: ruta });
});

// @desc  Desactivar (soft delete) una ruta
// @route DELETE /api/rutas/:id
const eliminar = asyncHandler(async (req, res) => {
  const ruta = await Ruta.findByPk(req.params.id);
  if (!ruta) {
    return res.status(404).json({ success: false, message: 'Ruta no encontrada.' });
  }

  await ruta.update({ activo: false });
  res.json({ success: true, message: 'Ruta desactivada correctamente.' });
});

module.exports = { listar, obtener, crear, actualizar, eliminar };
