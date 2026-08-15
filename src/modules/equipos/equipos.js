const express = require('express');
const { body, param, query } = require('express-validator');
const { Op, fn, col, where: sqlWhere } = require('sequelize');

const { Equipo } = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');

const router = express.Router();

const vacio = (v) => v === undefined || v === null || v === '';
const ESTADOS = Equipo.ESTADOS || ['bueno', 'regular', 'dañado'];

const normalizarCampos = (body = {}) => {
  const datos = {};
  if (body.nombre !== undefined) datos.nombre = String(body.nombre).trim();
  if (body.categoria !== undefined) datos.categoria = vacio(body.categoria) ? null : String(body.categoria).trim();
  if (body.ubicacion !== undefined) datos.ubicacion = vacio(body.ubicacion) ? null : String(body.ubicacion).trim();
  if (body.notas !== undefined) datos.notas = vacio(body.notas) ? null : String(body.notas).trim();
  if (body.estado !== undefined) datos.estado = String(body.estado).trim();
  if (body.cantidad !== undefined) {
    datos.cantidad = vacio(body.cantidad) ? 0 : Math.trunc(Number(body.cantidad));
  }
  if (body.activo !== undefined) datos.activo = body.activo === true || body.activo === 'true';
  return datos;
};

const validarDatos = (datos, { esCreacion }) => {
  if (esCreacion && !datos.nombre) return 'El nombre del equipo es obligatorio.';
  if (datos.nombre !== undefined && !datos.nombre) return 'El nombre del equipo es obligatorio.';
  if (datos.estado !== undefined && !ESTADOS.includes(datos.estado)) {
    return `Estado inválido. Use: ${ESTADOS.join(', ')}.`;
  }
  if (datos.cantidad !== undefined) {
    if (Number.isNaN(datos.cantidad) || datos.cantidad < 0) return 'La cantidad debe ser 0 o más.';
  }
  return null;
};

/** Busca otro equipo con el mismo nombre, sin distinguir mayúsculas. */
const buscarPorNombre = async (nombre, excluirId = null) => {
  const condiciones = [sqlWhere(fn('lower', col('nombre')), String(nombre).trim().toLowerCase())];
  if (excluirId) condiciones.push({ id: { [Op.ne]: excluirId } });
  return Equipo.findOne({ where: { [Op.and]: condiciones } });
};

// @desc  Listado con sus totales y las categorías que existen.
// @route GET /api/equipos?buscar=&categoria=&estado=&activo=
const listar = asyncHandler(async (req, res) => {
  const { buscar, categoria, estado, activo } = req.query;

  const filtro = {};
  if (activo !== undefined) filtro.activo = activo === 'true';
  if (!vacio(categoria)) filtro.categoria = categoria;
  if (!vacio(estado)) filtro.estado = estado;
  if (!vacio(buscar)) {
    const texto = `%${String(buscar).trim()}%`;
    filtro[Op.or] = [{ nombre: { [Op.iLike]: texto } }, { ubicacion: { [Op.iLike]: texto } }];
  }

  const equipos = await Equipo.findAll({
    where: filtro,
    order: [
      ['categoria', 'ASC'],
      ['nombre', 'ASC'],
    ],
  });

  // Totales de lo que se está viendo. Se cuentan dos cosas distintas:
  // cuántos renglones hay y cuántas piezas suman entre todos.
  const activos = equipos.filter((e) => e.activo);
  const porCategoria = new Map();
  activos.forEach((e) => {
    const clave = e.categoria || 'Sin categoría';
    const acumulado = porCategoria.get(clave) || { categoria: clave, renglones: 0, piezas: 0 };
    acumulado.renglones += 1;
    acumulado.piezas += Number(e.cantidad) || 0;
    porCategoria.set(clave, acumulado);
  });

  // Todas las categorías usadas alguna vez, para el selector y el filtro.
  const usadas = await Equipo.findAll({ attributes: ['categoria'], group: ['categoria'], raw: true });
  const categorias = [...new Set(usadas.map((c) => c.categoria).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );

  res.json({
    success: true,
    data: {
      equipos,
      categorias,
      categorias_sugeridas: Equipo.CATEGORIAS_SUGERIDAS || [],
      totales: {
        renglones: activos.length,
        piezas: activos.reduce((s, e) => s + (Number(e.cantidad) || 0), 0),
        en_mal_estado: activos.filter((e) => e.estado === 'dañado').length,
        por_categoria: [...porCategoria.values()].sort((a, b) => a.categoria.localeCompare(b.categoria, 'es')),
      },
    },
  });
});

const obtener = asyncHandler(async (req, res) => {
  const equipo = await Equipo.findByPk(req.params.id);
  if (!equipo) return res.status(404).json({ success: false, message: 'Equipo no encontrado.' });
  res.json({ success: true, data: equipo });
});

const crear = asyncHandler(async (req, res) => {
  const datos = normalizarCampos(req.body);

  const error = validarDatos(datos, { esCreacion: true });
  if (error) return res.status(400).json({ success: false, message: error });

  // Dos renglones con el mismo nombre hacen que el conteo deje de servir:
  // nadie sabe cuál de los dos está al día.
  const repetido = await buscarPorNombre(datos.nombre);
  if (repetido) {
    return res.status(400).json({
      success: false,
      message: `Ya existe «${repetido.nombre}» con ${repetido.cantidad} en inventario. Edite ese renglón en vez de crear otro.`,
    });
  }

  const equipo = await Equipo.create({ ...datos, cantidad: datos.cantidad ?? 0 });
  res.status(201).json({ success: true, message: 'Equipo agregado.', data: equipo });
});

const actualizar = asyncHandler(async (req, res) => {
  const equipo = await Equipo.findByPk(req.params.id);
  if (!equipo) return res.status(404).json({ success: false, message: 'Equipo no encontrado.' });

  const datos = normalizarCampos(req.body);
  const error = validarDatos(datos, { esCreacion: false });
  if (error) return res.status(400).json({ success: false, message: error });

  if (datos.nombre && datos.nombre.toLowerCase() !== equipo.nombre.toLowerCase()) {
    const repetido = await buscarPorNombre(datos.nombre, equipo.id);
    if (repetido) {
      return res.status(400).json({ success: false, message: `Ya existe «${repetido.nombre}» en el inventario.` });
    }
  }

  await equipo.update(datos);
  res.json({ success: true, message: 'Equipo actualizado.', data: equipo });
});

/**
 * Sumar o restar de a poco, sin abrir el formulario. Es lo que se usa
 * mientras se cuenta físicamente: se van marcando los que aparecen.
 * @route PATCH /api/equipos/:id/cantidad  { cambio: 1 } o { cantidad: 12 }
 */
const ajustarCantidad = asyncHandler(async (req, res) => {
  const equipo = await Equipo.findByPk(req.params.id);
  if (!equipo) return res.status(404).json({ success: false, message: 'Equipo no encontrado.' });

  let nueva;
  if (req.body.cantidad !== undefined) {
    nueva = Math.trunc(Number(req.body.cantidad));
  } else {
    const cambio = Math.trunc(Number(req.body.cambio));
    if (Number.isNaN(cambio) || cambio === 0) {
      return res.status(400).json({ success: false, message: 'Indique cuánto sumar o restar.' });
    }
    nueva = Number(equipo.cantidad) + cambio;
  }

  if (Number.isNaN(nueva)) return res.status(400).json({ success: false, message: 'Cantidad inválida.' });
  if (nueva < 0) {
    return res.status(400).json({
      success: false,
      message: `No se puede bajar de 0: hay ${equipo.cantidad} de ${equipo.nombre}.`,
    });
  }

  await equipo.update({ cantidad: nueva });
  res.json({ success: true, data: equipo });
});

const archivar = asyncHandler(async (req, res) => {
  const equipo = await Equipo.findByPk(req.params.id);
  if (!equipo) return res.status(404).json({ success: false, message: 'Equipo no encontrado.' });

  // Se archiva, no se borra: lo que se dio de baja también es historia.
  await equipo.update({ activo: false });
  res.json({ success: true, message: 'Equipo archivado.' });
});

// ---------- Reglas ----------
const reglasEquipo = (esCreacion) => [
  esCreacion
    ? body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio')
    : body('nombre').optional().trim().notEmpty().withMessage('El nombre no puede quedar vacío'),
  body('cantidad')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? 0 : v))
    .custom((v) => !Number.isNaN(Number(v)) && Number(v) >= 0)
    .withMessage('La cantidad debe ser 0 o más'),
  body('estado').optional({ nullable: true }).isIn(ESTADOS).withMessage(`Estado inválido. Use: ${ESTADOS.join(', ')}`),
  body('categoria').optional({ nullable: true }).isLength({ max: 60 }).withMessage('Categoría demasiado larga'),
  body('ubicacion').optional({ nullable: true }).isLength({ max: 120 }).withMessage('Ubicación demasiado larga'),
  body('notas').optional({ nullable: true }).isLength({ max: 255 }).withMessage('Nota demasiado larga'),
];

router.use(proteger);

router.get('/', [query('activo').optional().isIn(['true', 'false'])], validar, listar);
router.get('/:id', [param('id').isInt().withMessage('Id inválido')], validar, obtener);
router.post('/', reglasEquipo(true), validar, crear);
router.put('/:id', [param('id').isInt().withMessage('Id inválido'), ...reglasEquipo(false)], validar, actualizar);
router.patch('/:id/cantidad', [param('id').isInt().withMessage('Id inválido')], validar, ajustarCantidad);
router.delete('/:id', permitirRoles('admin'), [param('id').isInt()], validar, archivar);

module.exports = router;
