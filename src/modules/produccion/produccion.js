const express = require('express');
const { body, param, query } = require('express-validator');
const { Op } = require('sequelize');

const { LoteProduccion } = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');

// Se reutiliza la formula que ya estaba en calculo.service.js. Es seguro
// importarla aunque UsoInsumo todavia no exista como modelo: esa funcion
// en particular no toca Insumo ni UsoInsumo, solo hace litros/kilos.
const { calcularPorcentajeLitroKilo } = require('../../services/calculo.service');

const router = express.Router();

const vacio = (v) => v === undefined || v === null || v === '';
const sumar = (arr) => arr.reduce((acc, n) => acc + Number(n || 0), 0);

/**
 * Si viene detalle_litros (aportes de cada productor/rutero), los litros
 * utilizados se calculan solos sumandolos. Si no, se usa el numero que
 * mandaron directo en litros_utilizados.
 */
const resolverLitros = (body) => {
  if (Array.isArray(body.detalle_litros) && body.detalle_litros.length > 0) {
    const total = sumar(body.detalle_litros.map((d) => (typeof d === 'object' && d !== null ? d.litros : d)));
    return { litros_utilizados: Number(total.toFixed(2)), detalle_litros: body.detalle_litros };
  }
  return {
    litros_utilizados: vacio(body.litros_utilizados) ? null : Number(body.litros_utilizados),
    detalle_litros: null,
  };
};

/**
 * Igual que los litros: si viene detalle_pesos (peso de cada pieza),
 * kilos_obtenidos y cantidad_unidades se calculan solos.
 */
const resolverKilos = (body) => {
  if (Array.isArray(body.detalle_pesos) && body.detalle_pesos.length > 0) {
    const pesos = body.detalle_pesos.map(Number);
    return {
      kilos_obtenidos: Number(sumar(pesos).toFixed(3)),
      detalle_pesos: pesos,
      cantidad_unidades: pesos.length,
    };
  }
  return {
    kilos_obtenidos: vacio(body.kilos_obtenidos) ? null : Number(body.kilos_obtenidos),
    detalle_pesos: null,
    cantidad_unidades: vacio(body.cantidad_unidades) ? null : Number(body.cantidad_unidades),
  };
};

// Solo toca en "datos" los campos que de verdad llegaron en el body, para
// no pisar con null algo que el usuario no quiso tocar en un PUT parcial.
const normalizarCampos = (body = {}) => {
  const datos = {};
  if (body.fecha !== undefined) datos.fecha = body.fecha;
  if (body.producto !== undefined) datos.producto = String(body.producto).trim();
  if (body.notas !== undefined) datos.notas = vacio(body.notas) ? null : String(body.notas).trim();
  if (body.activo !== undefined) datos.activo = body.activo === true || body.activo === 'true';

  const huboLitros = body.litros_utilizados !== undefined || (Array.isArray(body.detalle_litros) && body.detalle_litros.length > 0);
  if (huboLitros) Object.assign(datos, resolverLitros(body));

  const huboKilos = body.kilos_obtenidos !== undefined || (Array.isArray(body.detalle_pesos) && body.detalle_pesos.length > 0);
  if (huboKilos) Object.assign(datos, resolverKilos(body));

  return datos;
};

const validarDatos = (datos, { esCreacion }) => {
  if (esCreacion && !datos.producto) return 'El producto es obligatorio.';
  if (datos.producto !== undefined && !datos.producto) return 'El producto es obligatorio.';

  if (esCreacion && vacio(datos.litros_utilizados)) {
    return 'Indique los litros utilizados (directo o con el detalle por productor/rutero).';
  }
  if (datos.litros_utilizados !== undefined && datos.litros_utilizados !== null) {
    if (Number.isNaN(datos.litros_utilizados) || datos.litros_utilizados <= 0) {
      return 'Los litros utilizados deben ser un número mayor a 0.';
    }
  }

  if (esCreacion && vacio(datos.kilos_obtenidos)) {
    return 'Indique los kilos obtenidos (directo o con el detalle de peso por unidad).';
  }
  if (datos.kilos_obtenidos !== undefined && datos.kilos_obtenidos !== null) {
    if (Number.isNaN(datos.kilos_obtenidos) || datos.kilos_obtenidos <= 0) {
      return 'Los kilos obtenidos deben ser un número mayor a 0.';
    }
  }

  return null;
};

const listar = asyncHandler(async (req, res) => {
  const { producto, fecha_inicio, fecha_fin, activo } = req.query;
  const where = {};
  if (activo !== undefined) where.activo = activo === 'true';
  if (!vacio(producto)) where.producto = { [Op.iLike]: `%${String(producto).trim()}%` };
  if (!vacio(fecha_inicio) && !vacio(fecha_fin)) where.fecha = { [Op.between]: [fecha_inicio, fecha_fin] };

  const lotes = await LoteProduccion.findAll({
    where,
    order: [
      ['fecha', 'DESC'],
      ['id', 'DESC'],
    ],
  });
  res.json({ success: true, data: lotes });
});

// Rendimiento promedio por tipo de producto: util para ver, por ejemplo,
// que el Semiduro anda rindiendo ~6.35 litros por kilo en general.
const resumenPorProducto = asyncHandler(async (req, res) => {
  const lotes = await LoteProduccion.findAll({ where: { activo: true } });

  const mapa = new Map();
  lotes.forEach((l) => {
    if (!mapa.has(l.producto)) mapa.set(l.producto, { producto: l.producto, lotes: 0, litros: 0, kilos: 0 });
    const r = mapa.get(l.producto);
    r.lotes += 1;
    r.litros += Number(l.litros_utilizados);
    r.kilos += Number(l.kilos_obtenidos);
  });

  const resumen = [...mapa.values()].map((r) => ({
    ...r,
    litros: Number(r.litros.toFixed(2)),
    kilos: Number(r.kilos.toFixed(3)),
    porcentaje_promedio: r.kilos > 0 ? calcularPorcentajeLitroKilo(r.litros, r.kilos) : 0,
  }));

  res.json({ success: true, data: resumen });
});

const obtener = asyncHandler(async (req, res) => {
  const lote = await LoteProduccion.findByPk(req.params.id);
  if (!lote) return res.status(404).json({ success: false, message: 'Lote de producción no encontrado.' });
  res.json({ success: true, data: lote });
});

const crear = asyncHandler(async (req, res) => {
  const datos = normalizarCampos(req.body);

  const error = validarDatos(datos, { esCreacion: true });
  if (error) return res.status(400).json({ success: false, message: error });

  datos.porcentaje_litro_kilo = calcularPorcentajeLitroKilo(datos.litros_utilizados, datos.kilos_obtenidos);

  const lote = await LoteProduccion.create(datos);
  res.status(201).json({ success: true, data: lote });
});

const actualizar = asyncHandler(async (req, res) => {
  const lote = await LoteProduccion.findByPk(req.params.id);
  if (!lote) return res.status(404).json({ success: false, message: 'Lote de producción no encontrado.' });

  const datos = normalizarCampos(req.body);
  const error = validarDatos(datos, { esCreacion: false });
  if (error) return res.status(400).json({ success: false, message: error });

  // El % se recalcula siempre que cambie litros o kilos; si no cambio
  // ninguno, se recalcula igual con los valores que ya tenia (no pasa nada).
  const litros = datos.litros_utilizados ?? lote.litros_utilizados;
  const kilos = datos.kilos_obtenidos ?? lote.kilos_obtenidos;
  datos.porcentaje_litro_kilo = calcularPorcentajeLitroKilo(litros, kilos);

  await lote.update(datos);
  res.json({ success: true, data: lote });
});

const eliminar = asyncHandler(async (req, res) => {
  const lote = await LoteProduccion.findByPk(req.params.id);
  if (!lote) return res.status(404).json({ success: false, message: 'Lote de producción no encontrado.' });

  await lote.update({ activo: false });
  res.json({ success: true, message: 'Lote de producción desactivado.' });
});

// ---------- Reglas de validación ----------
const reglasLote = (esCreacion) => [
  esCreacion
    ? body('producto').trim().notEmpty().withMessage('El producto es obligatorio')
    : body('producto').optional().trim().notEmpty().withMessage('El producto no puede quedar vacío'),
  body('fecha').optional({ nullable: true }).isISO8601().withMessage('Fecha inválida'),
  body('litros_utilizados')
    .optional({ nullable: true })
    .custom((v) => vacio(v) || (!Number.isNaN(Number(v)) && Number(v) > 0))
    .withMessage('Los litros utilizados deben ser un número mayor a 0'),
  body('kilos_obtenidos')
    .optional({ nullable: true })
    .custom((v) => vacio(v) || (!Number.isNaN(Number(v)) && Number(v) > 0))
    .withMessage('Los kilos obtenidos deben ser un número mayor a 0'),
  body('detalle_litros').optional({ nullable: true }).isArray().withMessage('El detalle de litros debe ser una lista'),
  body('detalle_pesos').optional({ nullable: true }).isArray().withMessage('El detalle de pesos debe ser una lista'),
  body('notas').optional({ nullable: true }).isLength({ max: 255 }).withMessage('Nota demasiado larga'),
];

router.use(proteger);

router.get('/', [query('activo').optional().isIn(['true', 'false'])], validar, listar);
router.get('/resumen-por-producto', resumenPorProducto);
router.get('/:id', [param('id').isInt().withMessage('Id inválido')], validar, obtener);
router.post('/', reglasLote(true), validar, crear);
router.put('/:id', [param('id').isInt().withMessage('Id inválido'), ...reglasLote(false)], validar, actualizar);
router.delete('/:id', permitirRoles('admin'), [param('id').isInt()], validar, eliminar);

module.exports = router;
