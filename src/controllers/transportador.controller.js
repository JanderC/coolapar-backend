const { Transportador } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const { activo } = req.query;
  const where = {};
  if (activo !== undefined) where.activo = activo === 'true';

  const transportadores = await Transportador.findAll({ where, order: [['nombre', 'ASC']] });
  res.json({ success: true, data: transportadores });
});

const obtener = asyncHandler(async (req, res) => {
  const transportador = await Transportador.findByPk(req.params.id);
  if (!transportador) {
    return res.status(404).json({ success: false, message: 'Transportador no encontrado.' });
  }
  res.json({ success: true, data: transportador });
});

const crear = asyncHandler(async (req, res) => {
  const { nombre, telefono, tarifa_flete_diario } = req.body;
  const transportador = await Transportador.create({ nombre, telefono, tarifa_flete_diario });
  res.status(201).json({ success: true, data: transportador });
});

const actualizar = asyncHandler(async (req, res) => {
  const transportador = await Transportador.findByPk(req.params.id);
  if (!transportador) {
    return res.status(404).json({ success: false, message: 'Transportador no encontrado.' });
  }

  await transportador.update(req.body);
  res.json({ success: true, data: transportador });
});

const eliminar = asyncHandler(async (req, res) => {
  const transportador = await Transportador.findByPk(req.params.id);
  if (!transportador) {
    return res.status(404).json({ success: false, message: 'Transportador no encontrado.' });
  }

  await transportador.update({ activo: false });
  res.json({ success: true, message: 'Transportador desactivado correctamente.' });
});

module.exports = { listar, obtener, crear, actualizar, eliminar };
