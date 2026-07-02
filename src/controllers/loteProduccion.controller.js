const {
  LoteProduccion,
  Recibido,
  Insumo,
  UsoInsumo,
  ElaboracionProducto,
  Producto,
  sequelize,
} = require('../models');
const asyncHandler = require('../utils/asyncHandler');

// @desc  Listar lotes de produccion (incluye el historial de % litro/kilo)
// @route GET /api/lotes-produccion
const listar = asyncHandler(async (req, res) => {
  const lotes = await LoteProduccion.findAll({
    include: [
      { model: Recibido, attributes: ['id', 'fecha', 'litros_utiles'] },
      { model: UsoInsumo, include: [{ model: Insumo, attributes: ['id', 'nombre', 'unidad_medida'] }] },
      { model: ElaboracionProducto, include: [{ model: Producto, attributes: ['id', 'nombre'] }] },
    ],
    order: [['fecha', 'DESC']],
  });

  res.json({ success: true, data: lotes });
});

// @desc  Obtener el historial de porcentaje litro/kilo (solo esa columna, ordenado)
// @route GET /api/lotes-produccion/historial-porcentaje
const historialPorcentaje = asyncHandler(async (req, res) => {
  const historial = await LoteProduccion.findAll({
    attributes: ['id', 'fecha', 'litros_utilizados', 'kilos_obtenidos', 'porcentaje_litro_kilo'],
    order: [['fecha', 'DESC']],
  });

  res.json({ success: true, data: historial });
});

// @desc  Registrar un lote de produccion. El % litro/kilo lo calcula la BD.
//        Ademas, calcula automaticamente cuanto de cada insumo (ej. sal) se
//        debe gastar: litros_utilizados * factor_por_litro del insumo.
// @route POST /api/lotes-produccion
const crear = asyncHandler(async (req, res) => {
  const { fecha, recibido_id, litros_utilizados, kilos_obtenidos, observaciones } = req.body;

  const resultado = await sequelize.transaction(async (t) => {
    const lote = await LoteProduccion.create(
      { fecha, recibido_id, litros_utilizados, kilos_obtenidos, observaciones },
      { transaction: t }
    );

    // Calcula automaticamente el uso de cada insumo activo que tenga un
    // factor_por_litro definido (ej: sal).
    const insumos = await Insumo.findAll({
      where: { factor_por_litro: { [require('sequelize').Op.ne]: null } },
      transaction: t,
    });

    if (insumos.length > 0) {
      const usosInsumo = insumos.map((insumo) => ({
        lote_produccion_id: lote.id,
        insumo_id: insumo.id,
        cantidad_calculada: parseFloat(litros_utilizados) * parseFloat(insumo.factor_por_litro),
      }));

      await UsoInsumo.bulkCreate(usosInsumo, { transaction: t });
    }

    return lote;
  });

  const loteCompleto = await LoteProduccion.findByPk(resultado.id, {
    include: [{ model: UsoInsumo, include: [{ model: Insumo }] }],
  });

  res.status(201).json({ success: true, data: loteCompleto });
});

// @desc  Actualizar un lote de produccion
// @route PUT /api/lotes-produccion/:id
const actualizar = asyncHandler(async (req, res) => {
  const lote = await LoteProduccion.findByPk(req.params.id);
  if (!lote) {
    return res.status(404).json({ success: false, message: 'Lote de produccion no encontrado.' });
  }

  const { litros_utilizados, kilos_obtenidos, observaciones } = req.body;
  await lote.update({ litros_utilizados, kilos_obtenidos, observaciones });

  res.json({ success: true, data: lote });
});

// @desc  Registrar que productos (tipos de queso) salieron de un lote
// @route POST /api/lotes-produccion/:id/elaboracion
const registrarElaboracion = asyncHandler(async (req, res) => {
  const lote = await LoteProduccion.findByPk(req.params.id);
  if (!lote) {
    return res.status(404).json({ success: false, message: 'Lote de produccion no encontrado.' });
  }

  const { producto_id, cantidad_piezas, kilos_totales } = req.body;

  const elaboracion = await ElaboracionProducto.create({
    lote_produccion_id: lote.id,
    producto_id,
    cantidad_piezas,
    kilos_totales,
  });

  res.status(201).json({ success: true, data: elaboracion });
});

module.exports = { listar, historialPorcentaje, crear, actualizar, registrarElaboracion };
