const { RegistroLecheProductor, Productor, SemanaPago } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// @desc  Listar registros de leche (filtrable por productor, semana o rango de fechas)
// @route GET /api/registros-leche?productor_id=&semana_id=&desde=&hasta=
const listar = asyncHandler(async (req, res) => {
  const { productor_id, semana_id } = req.query;
  const where = {};
  if (productor_id) where.productor_id = productor_id;
  if (semana_id) where.semana_id = semana_id;

  const registros = await RegistroLecheProductor.findAll({
    where,
    include: [
      { model: Productor, attributes: ['id', 'nombre', 'color_identificativo'] },
      { model: SemanaPago, attributes: ['id', 'fecha_inicio', 'estado'] },
    ],
    order: [['fecha', 'DESC']],
  });

  res.json({ success: true, data: registros });
});

// @desc  Registrar la leche que trajo un productor en un dia especifico
// @route POST /api/registros-leche
const crear = asyncHandler(async (req, res) => {
  const { productor_id, semana_id, fecha, litros, precio_litro } = req.body;

  const productor = await Productor.findByPk(productor_id);
  if (!productor) {
    return res.status(404).json({ success: false, message: 'Productor no encontrado.' });
  }

  const semana = await SemanaPago.findByPk(semana_id);
  if (!semana) {
    return res.status(404).json({ success: false, message: 'Semana de pago no encontrada.' });
  }

  const registro = await RegistroLecheProductor.create({
    productor_id,
    semana_id,
    fecha,
    litros,
    precio_litro: precio_litro || productor.precio_litro_base,
  });

  res.status(201).json({ success: true, data: registro });
});

// @desc  Actualizar un registro de leche
// @route PUT /api/registros-leche/:id
const actualizar = asyncHandler(async (req, res) => {
  const registro = await RegistroLecheProductor.findByPk(req.params.id);
  if (!registro) {
    return res.status(404).json({ success: false, message: 'Registro no encontrado.' });
  }

  const { litros, precio_litro, fecha } = req.body;
  await registro.update({ litros, precio_litro, fecha });

  res.json({ success: true, data: registro });
});

// @desc  Eliminar un registro de leche
// @route DELETE /api/registros-leche/:id
const eliminar = asyncHandler(async (req, res) => {
  const registro = await RegistroLecheProductor.findByPk(req.params.id);
  if (!registro) {
    return res.status(404).json({ success: false, message: 'Registro no encontrado.' });
  }

  await registro.destroy();
  res.json({ success: true, message: 'Registro eliminado correctamente.' });
});

module.exports = { listar, crear, actualizar, eliminar };
