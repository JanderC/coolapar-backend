const express = require('express');
const { body, param, query } = require('express-validator');
const { Op } = require('sequelize');

const { LoteProduccion, Insumo, MovimientoInsumo, MovimientoCuartoFrio, sequelize } = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const { proteger, permitirRoles } = require('../../middlewares/auth.middleware');
const validar = require('../../middlewares/validate.middleware');

// Se reutiliza la formula que ya estaba en calculo.service.js. Es seguro
// importarla aunque UsoInsumo todavia no exista como modelo: esa funcion
// en particular no toca Insumo ni UsoInsumo, solo hace litros/kilos.
const { calcularPorcentajeLitroKilo } = require('../../services/calculo.service');
const { ErrorDeNegocio } = require('../../services/insumos.service');
const produccionService = require('../../services/produccion.service');
const cuartoFrioService = require('../../services/cuartoFrio.service');

const router = express.Router();

const vacio = (v) => v === undefined || v === null || v === '';
const sumar = (arr) => arr.reduce((acc, n) => acc + Number(n || 0), 0);

const MONEDAS = ['BS', 'USD', 'COP'];

/**
 * Lineas de insumos que llegan del formulario. Se aceptan solo las que
 * traen un insumo y una cantidad usable; el resto se descarta en silencio
 * (son filas que el usuario agrego y dejo vacias).
 */
/**
 * Quesos del cuarto frio que se van a fundir en este lote.
 * [{ producto, kilos, piezas }]
 */
const normalizarReproceso = (lista) => {
  if (!Array.isArray(lista)) return null;
  return lista
    .map((l) => ({
      producto: String(l?.producto || '').trim(),
      kilos: Number(l?.kilos),
      piezas: vacio(l?.piezas) ? null : Number.parseInt(l.piezas, 10),
    }))
    .filter((l) => l.producto && !Number.isNaN(l.kilos) && l.kilos > 0);
};

const normalizarInsumos = (lista) => {
  if (!Array.isArray(lista)) return null;
  return lista
    .map((l) => ({ insumo_id: Number(l?.insumo_id), cantidad: Number(l?.cantidad) }))
    .filter((l) => l.insumo_id > 0 && !Number.isNaN(l.cantidad) && l.cantidad > 0);
};

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
//
// OJO: porcentaje_litro_kilo NO se toca nunca aqui. En la base de datos es
// una columna generada (GENERATED ALWAYS AS ... STORED) y Postgres rechaza
// cualquier INSERT/UPDATE que le mande un valor, con el error:
//   "cannot insert a non-DEFAULT value into column porcentaje_litro_kilo"
const normalizarCampos = (body = {}) => {
  const datos = {};
  if (body.fecha !== undefined) datos.fecha = body.fecha;
  if (body.producto !== undefined) datos.producto = String(body.producto).trim();
  if (body.notas !== undefined) datos.notas = vacio(body.notas) ? null : String(body.notas).trim();

  // Precio de la leche de este lote: se escribe a mano porque la leche no
  // sale del inventario, entra por el registro diario de los productores.
  if (body.precio_litro_leche !== undefined) {
    datos.precio_litro_leche = vacio(body.precio_litro_leche) ? null : Number(body.precio_litro_leche);
  }
  if (body.moneda_leche !== undefined) {
    datos.moneda_leche = vacio(body.moneda_leche) ? null : String(body.moneda_leche).toUpperCase();
  }
  if (body.activo !== undefined) datos.activo = body.activo === true || body.activo === 'true';

  const huboLitros = body.litros_utilizados !== undefined || (Array.isArray(body.detalle_litros) && body.detalle_litros.length > 0);
  if (huboLitros) Object.assign(datos, resolverLitros(body));

  const huboKilos = body.kilos_obtenidos !== undefined || (Array.isArray(body.detalle_pesos) && body.detalle_pesos.length > 0);
  if (huboKilos) Object.assign(datos, resolverKilos(body));

  // Cinturon de seguridad: si algun dia alguien manda el porcentaje en el
  // body, lo descartamos antes de que llegue a la consulta.
  delete datos.porcentaje_litro_kilo;

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

  if (datos.precio_litro_leche !== undefined && datos.precio_litro_leche !== null) {
    if (Number.isNaN(datos.precio_litro_leche) || datos.precio_litro_leche < 0) {
      return 'El precio de la leche debe ser un número mayor o igual a 0.';
    }
  }
  if (datos.moneda_leche && !MONEDAS.includes(datos.moneda_leche)) {
    return `Moneda inválida. Use una de: ${MONEDAS.join(', ')}.`;
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

// Los movimientos de cuarto frio del lote viajan con el: la pantalla los
// necesita para reponer el bloque de reproceso al editar.
const incluirCuartoFrio = [
  {
    model: MovimientoCuartoFrio,
    as: 'MovimientosCuartoFrio',
    required: false,
    attributes: ['id', 'producto', 'tipo', 'signo', 'kilos', 'piezas'],
  },
];

const listar = asyncHandler(async (req, res) => {
  const { producto, fecha_inicio, fecha_fin, activo } = req.query;
  const where = {};
  if (activo !== undefined) where.activo = activo === 'true';
  if (!vacio(producto)) where.producto = { [Op.iLike]: `%${String(producto).trim()}%` };
  if (!vacio(fecha_inicio) && !vacio(fecha_fin)) where.fecha = { [Op.between]: [fecha_inicio, fecha_fin] };

  const lotes = await LoteProduccion.findAll({
    where,
    include: incluirCuartoFrio,
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

// La formula del ultimo lote de un producto. Sirve para que al elegir
// "Semiduro" el formulario proponga lo que se gasto la vez pasada, en vez
// de obligar a cargar todo de nuevo cada dia.
const ultimaFormula = asyncHandler(async (req, res) => {
  const producto = String(req.query.producto || '').trim();
  if (!producto) return res.status(400).json({ success: false, message: 'Indique el producto.' });

  const lote = await LoteProduccion.findOne({
    where: { producto, activo: true },
    order: [
      ['fecha', 'DESC'],
      ['id', 'DESC'],
    ],
  });

  if (!lote || !Array.isArray(lote.insumos_usados) || lote.insumos_usados.length === 0) {
    return res.json({ success: true, data: null });
  }

  res.json({
    success: true,
    data: {
      lote_id: lote.id,
      fecha: lote.fecha,
      producto: lote.producto,
      litros_utilizados: lote.litros_utilizados,
      kilos_obtenidos: lote.kilos_obtenidos,
      precio_litro_leche: lote.precio_litro_leche,
      moneda_leche: lote.moneda_leche,
      insumos_usados: lote.insumos_usados,
    },
  });
});

const obtener = asyncHandler(async (req, res) => {
  const lote = await LoteProduccion.findByPk(req.params.id, { include: incluirCuartoFrio });
  if (!lote) return res.status(404).json({ success: false, message: 'Lote de producción no encontrado.' });
  res.json({ success: true, data: lote });
});

const crear = asyncHandler(async (req, res) => {
  const datos = normalizarCampos(req.body);

  const error = validarDatos(datos, { esCreacion: true });
  if (error) return res.status(400).json({ success: false, message: error });

  const insumos = normalizarInsumos(req.body.insumos_usados);
  const reproceso = normalizarReproceso(req.body.reproceso_cuarto_frio);

  try {
    // El lote y el descuento de inventario van en la MISMA transaccion: o
    // se guarda todo, o no se guarda nada. Si un insumo no alcanza, el
    // lote tampoco queda creado.
    const lote = await sequelize.transaction(async (transaction) => {
      // fields limita el INSERT a exactamente las columnas que preparamos,
      // asi Sequelize nunca incluye porcentaje_litro_kilo (columna generada).
      const creado = await LoteProduccion.create(datos, {
        fields: Object.keys(datos),
        transaction,
      });

      if (insumos && insumos.length > 0) {
        const foto = await produccionService.aplicarConsumo(creado, insumos, transaction);
        await creado.update({ insumos_usados: foto }, { fields: ['insumos_usados'], transaction });
      }

      // Quesos viejos que se funden en este lote: salen del cuarto frio.
      if (reproceso && reproceso.length > 0) {
        await cuartoFrioService.aplicarReproceso(creado, reproceso, transaction);
      }

      // Y lo que se fabrico entra al cuarto frio, sin que nadie lo cargue
      // a mano: es el mismo dato de kilos_obtenidos del lote.
      await cuartoFrioService.registrarProduccion(creado, transaction);

      // reload trae el porcentaje ya calculado por la base de datos.
      await creado.reload({ transaction });
      return creado;
    });

    res.status(201).json({ success: true, data: lote });
  } catch (err) {
    if (err.esErrorDeNegocio) return res.status(400).json({ success: false, message: err.message });
    throw err;
  }
});

const actualizar = asyncHandler(async (req, res) => {
  const lote = await LoteProduccion.findByPk(req.params.id);
  if (!lote) return res.status(404).json({ success: false, message: 'Lote de producción no encontrado.' });

  const datos = normalizarCampos(req.body);
  const error = validarDatos(datos, { esCreacion: false });
  if (error) return res.status(400).json({ success: false, message: error });

  // Solo se toca el inventario si el formulario mando la formula. Un PUT
  // que solo cambia las notas no devuelve ni vuelve a consumir nada.
  const insumos = normalizarInsumos(req.body.insumos_usados);
  const reproceso = normalizarReproceso(req.body.reproceso_cuarto_frio);
  const reactivando = datos.activo === true && lote.activo === false;
  const anulando = datos.activo === false && lote.activo === true;

  // Si cambian los kilos o el producto, lo que este lote metio al cuarto
  // frio deja de ser cierto y hay que rehacerlo.
  const cambioLoProducido =
    (datos.kilos_obtenidos !== undefined && Number(datos.kilos_obtenidos) !== Number(lote.kilos_obtenidos)) ||
    (datos.cantidad_unidades !== undefined && Number(datos.cantidad_unidades) !== Number(lote.cantidad_unidades)) ||
    (datos.producto !== undefined && datos.producto !== lote.producto) ||
    (datos.fecha !== undefined && String(datos.fecha) !== String(lote.fecha));

  try {
    await sequelize.transaction(async (transaction) => {
      if (insumos !== null) {
        // Primero se devuelve TODO lo que este lote tenia consumido y
        // despues se aplica la formula nueva. Asi da igual si el usuario
        // subio, bajo o quito lineas.
        await produccionService.revertirConsumo(lote, transaction);
        const foto = await produccionService.aplicarConsumo(lote, insumos, transaction);
        datos.insumos_usados = foto.length > 0 ? foto : null;
      } else if (reactivando) {
        // Se reactiva un lote anulado: vuelve a consumir su formula.
        const guardada = Array.isArray(lote.insumos_usados) ? lote.insumos_usados : [];
        if (guardada.length > 0) {
          const foto = await produccionService.aplicarConsumo(lote, guardada, transaction);
          datos.insumos_usados = foto;
        }
      }

      if (reproceso !== null) {
        await cuartoFrioService.revertirReproceso(lote, transaction);
      }

      // No recalculamos el porcentaje: al cambiar litros o kilos, Postgres
      // regenera la columna automaticamente.
      await lote.update(datos, { fields: Object.keys(datos), transaction });
      await lote.reload({ transaction });

      // ---- Cuarto frio ----
      if (anulando) {
        await cuartoFrioService.revertirProduccion(lote, transaction);
        await cuartoFrioService.revertirReproceso(lote, transaction);
      } else {
        if (cambioLoProducido || reactivando) {
          // Se borra la entrada anterior y se vuelve a meter con los
          // datos nuevos, en vez de intentar calcular la diferencia.
          await cuartoFrioService.revertirProduccion(lote, transaction);
          await cuartoFrioService.registrarProduccion(lote, transaction);
        }
        if (reproceso !== null && reproceso.length > 0) {
          await cuartoFrioService.aplicarReproceso(lote, reproceso, transaction);
        }
      }
    });

    res.json({ success: true, data: lote });
  } catch (err) {
    if (err.esErrorDeNegocio) return res.status(400).json({ success: false, message: err.message });
    throw err;
  }
});

const eliminar = asyncHandler(async (req, res) => {
  const lote = await LoteProduccion.findByPk(req.params.id);
  if (!lote) return res.status(404).json({ success: false, message: 'Lote de producción no encontrado.' });

  try {
    const devueltos = await sequelize.transaction(async (transaction) => {
      // Al anular el lote, lo que gasto vuelve al inventario. La formula
      // se conserva en insumos_usados por si se reactiva.
      const lista = await produccionService.revertirConsumo(lote, transaction);

      // El queso que este lote habia metido sale del cuarto frio, y lo
      // que hubiera tomado de alli para reprocesar vuelve.
      await cuartoFrioService.revertirProduccion(lote, transaction);
      await cuartoFrioService.revertirReproceso(lote, transaction);

      await lote.update({ activo: false }, { fields: ['activo'], transaction });
      return lista;
    });

    res.json({
      success: true,
      message:
        devueltos.length > 0
          ? `Lote anulado. Se devolvieron ${devueltos.length} insumo(s) al inventario.`
          : 'Lote anulado.',
      data: { devueltos },
    });
  } catch (err) {
    if (err.esErrorDeNegocio) return res.status(400).json({ success: false, message: err.message });
    throw err;
  }
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
  body('insumos_usados').optional({ nullable: true }).isArray().withMessage('Los insumos gastados deben ser una lista'),
  body('reproceso_cuarto_frio')
    .optional({ nullable: true })
    .isArray()
    .withMessage('Los quesos reprocesados deben ser una lista'),
  body('precio_litro_leche')
    .optional({ nullable: true })
    .customSanitizer((v) => (v === '' ? null : v))
    .custom((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0))
    .withMessage('El precio de la leche debe ser un número mayor o igual a 0'),
  body('moneda_leche')
    .optional({ nullable: true })
    .customSanitizer((v) => (v ? String(v).toUpperCase() : v))
    .isIn(MONEDAS)
    .withMessage(`Moneda inválida. Use: ${MONEDAS.join(', ')}`),
];

router.use(proteger);

router.get('/', [query('activo').optional().isIn(['true', 'false'])], validar, listar);
router.get('/resumen-por-producto', resumenPorProducto);
router.get('/ultima-formula', ultimaFormula);
router.get('/:id', [param('id').isInt().withMessage('Id inválido')], validar, obtener);
router.post('/', reglasLote(true), validar, crear);
router.put('/:id', [param('id').isInt().withMessage('Id inválido'), ...reglasLote(false)], validar, actualizar);
router.delete('/:id', permitirRoles('admin'), [param('id').isInt()], validar, eliminar);

module.exports = router;