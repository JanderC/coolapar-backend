const { CuartoFrio, ElaboracionProducto, Producto, PiezaQueso } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// @desc  Listar registros de cuarto frio (filtrable por estado)
// @route GET /api/cuarto-frio?estado=en_frio
const listar = asyncHandler(async (req, res) => {
  const { estado } = req.query;
  const where = {};
  if (estado) where.estado = estado;

  const registros = await CuartoFrio.findAll({
    where,
    include: [
      { model: ElaboracionProducto, include: [{ model: Producto, attributes: ['id', 'nombre'] }] },
      { model: PiezaQueso },
    ],
    order: [['fecha_ingreso', 'DESC']],
  });

  res.json({ success: true, data: registros });
});

const obtener = asyncHandler(async (req, res) => {
  const registro = await CuartoFrio.findByPk(req.params.id, {
    include: [
      { model: ElaboracionProducto, include: [{ model: Producto }] },
      { model: PiezaQueso },
    ],
  });

  if (!registro) {
    return res.status(404).json({ success: false, message: 'Registro de cuarto frio no encontrado.' });
  }

  res.json({ success: true, data: registro });
});

// @desc  Ingresar la totalidad de quesos elaborados al cuarto frio
// @route POST /api/cuarto-frio
const crear = asyncHandler(async (req, res) => {
  const { elaboracion_id, fecha_ingreso, peso_inicial } = req.body;

  const elaboracion = await ElaboracionProducto.findByPk(elaboracion_id);
  if (!elaboracion) {
    return res.status(404).json({ success: false, message: 'Elaboracion de producto no encontrada.' });
  }

  const registro = await CuartoFrio.create({
    elaboracion_id,
    fecha_ingreso,
    peso_inicial,
    estado: 'en_frio',
  });

  res.status(201).json({ success: true, data: registro });
});

// @desc  Retirar del cuarto frio: registra peso final y calcula cuanto peso bajo
// @route PUT /api/cuarto-frio/:id/retirar
const retirar = asyncHandler(async (req, res) => {
  const registro = await CuartoFrio.findByPk(req.params.id);
  if (!registro) {
    return res.status(404).json({ success: false, message: 'Registro de cuarto frio no encontrado.' });
  }

  const { peso_final, fecha_salida } = req.body;

  await registro.update({
    peso_final,
    fecha_salida: fecha_salida || new Date(),
    estado: 'retirado',
  });

  res.json({ success: true, data: registro });
});

module.exports = { listar, obtener, crear, retirar };
