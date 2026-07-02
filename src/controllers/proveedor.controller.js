const { Proveedor } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const { activo } = req.query;
  const where = {};
  if (activo !== undefined) where.activo = activo === 'true';

  const proveedores = await Proveedor.findAll({ where, order: [['nombre', 'ASC']] });
  res.json({ success: true, data: proveedores });
});

const obtener = asyncHandler(async (req, res) => {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) {
    return res.status(404).json({ success: false, message: 'Proveedor no encontrado.' });
  }
  res.json({ success: true, data: proveedor });
});

const crear = asyncHandler(async (req, res) => {
  const { nombre, tipo_suministro, telefono, direccion, contacto } = req.body;
  const proveedor = await Proveedor.create({ nombre, tipo_suministro, telefono, direccion, contacto });
  res.status(201).json({ success: true, data: proveedor });
});

const actualizar = asyncHandler(async (req, res) => {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) {
    return res.status(404).json({ success: false, message: 'Proveedor no encontrado.' });
  }

  await proveedor.update(req.body);
  res.json({ success: true, data: proveedor });
});

const eliminar = asyncHandler(async (req, res) => {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) {
    return res.status(404).json({ success: false, message: 'Proveedor no encontrado.' });
  }

  await proveedor.update({ activo: false });
  res.json({ success: true, message: 'Proveedor desactivado correctamente.' });
});

module.exports = { listar, obtener, crear, actualizar, eliminar };
