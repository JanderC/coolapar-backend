const express = require('express');
const { Ruta, Productor } = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');

const router = express.Router();

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

const obtener = asyncHandler(async (req, res) => {
  const ruta = await Ruta.findByPk(req.params.id, { include: [{ model: Productor }] });
  if (!ruta) return res.status(404).json({ success: false, message: 'Ruta no encontrada.' });
  res.json({ success: true, data: ruta });
});

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

const actualizar = asyncHandler(async (req, res) => {
  const ruta = await Ruta.findByPk(req.params.id);
  if (!ruta) return res.status(404).json({ success: false, message: 'Ruta no encontrada.' });

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

const eliminar = asyncHandler(async (req, res) => {
  const ruta = await Ruta.findByPk(req.params.id);
  if (!ruta) return res.status(404).json({ success: false, message: 'Ruta no encontrada.' });

  await ruta.update({ activo: false });
  res.json({ success: true, message: 'Ruta desactivada correctamente.' });
});

// ---------- Rutas ----------
router.get('/', proteger, listar);
router.get('/:id', proteger, obtener);
router.post('/', proteger, permitirRoles('admin', 'operador'), crear);
router.put('/:id', proteger, permitirRoles('admin', 'operador'), actualizar);
router.delete('/:id', proteger, permitirRoles('admin'), eliminar);

module.exports = router;