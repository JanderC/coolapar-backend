const { Op } = require('sequelize');
const db = require('../models');
const { Venta, VentaItem, MovimientoSucursal, ProductoSucursal, Sucursal, sequelize } = db;
const { ErrorDeNegocio } = require('./insumos.service');
const cuartoFrioService = require('./cuartoFrio.service');

/**
 * Ventas, despachos a sucursal e inventario de sucursal.
 *
 * EL PUNTO DELICADO: la confirmación a ciegas.
 *
 * Cuando la planta despacha 50 kg a una sucursal, la sucursal NO puede
 * ver ese número. Solo ve "llegó Semiduro, ¿cuántos kilos contó?". Si
 * viera lo enviado, escribiría lo mismo sin contar y el control no
 * serviría de nada.
 *
 * Eso NO se resuelve escondiendo el dato en la pantalla: la respuesta
 * viaja igual y se puede leer desde el navegador. Se resuelve aquí,
 * armando dos vistas distintas de la misma venta —`paraSucursal` y la
 * completa— y devolviendo la recortada según quién pregunte.
 */

const redondearKg = (n) => Number(Number(n || 0).toFixed(3));
const redondearDinero = (n) => Number(Number(n || 0).toFixed(2));
const aEntero = (v) => (v === null || v === undefined || v === '' ? null : Number.parseInt(v, 10));

// Diferencia por debajo de esto se considera la misma cifra: son kilos
// con tres decimales y una balanza no repite el gramo exacto.
const TOLERANCIA_KG = 0.005;

// ============================================================
//  VISTAS SEGUN QUIEN PREGUNTA
// ============================================================

/**
 * La venta tal como la ve un usuario de sucursal.
 *
 * Mientras el despacho está pendiente se omiten los kilos enviados, el
 * precio y el total. Una vez confirmado ya no tiene sentido esconderlos:
 * el conteo ya se hizo y la sucursal necesita ver la comparación.
 */
const paraSucursal = (venta) => {
  const plano = venta.toJSON ? venta.toJSON() : venta;
  const yaConto = plano.estado_despacho !== 'pendiente';

  return {
    id: plano.id,
    fecha: plano.fecha,
    sucursal_id: plano.sucursal_id,
    estado: plano.estado,
    estado_despacho: plano.estado_despacho,
    fecha_recepcion: plano.fecha_recepcion,
    nota_recepcion: plano.nota_recepcion,
    resolucion: plano.resolucion,
    notas: plano.notas,
    items: (plano.Items || []).map((i) => ({
      id: i.id,
      producto: i.producto,
      kilos_recibidos: i.kilos_recibidos,
      piezas_recibidas: i.piezas_recibidas,
      // Solo después de contar.
      kilos_enviados: yaConto ? i.kilos : undefined,
      piezas_enviadas: yaConto ? i.piezas : undefined,
    })),
  };
};

/** La venta completa, para el administrador. */
const paraAdmin = (venta) => {
  const plano = venta.toJSON ? venta.toJSON() : venta;
  const items = (plano.Items || []).map((i) => {
    const enviados = Number(i.kilos);
    const recibidos = i.kilos_recibidos === null || i.kilos_recibidos === undefined ? null : Number(i.kilos_recibidos);
    return {
      ...i,
      kilos: enviados,
      kilos_recibidos: recibidos,
      diferencia: recibidos === null ? null : redondearKg(recibidos - enviados),
    };
  });

  return {
    ...plano,
    Items: items,
    total: Number(plano.total),
    diferencia_total:
      items.every((i) => i.diferencia === null)
        ? null
        : redondearKg(items.reduce((s, i) => s + (i.diferencia || 0), 0)),
  };
};

/** Elige la vista según el rol de quien consulta. */
const segunUsuario = (venta, usuario) =>
  usuario?.rol === 'sucursal' ? paraSucursal(venta) : paraAdmin(venta);

// ============================================================
//  INVENTARIO DE LA SUCURSAL
// ============================================================

/**
 * Existencia por producto: SUM(cantidad * signo).
 *
 * Se cruza con el catálogo para saber en qué se mide cada uno y a qué
 * precio se vende. Un producto del catálogo sin movimientos aparece
 * igual, en cero: hace falta para poder cargarlo y para armar la venta.
 */
const existenciaSucursal = async (sucursalId, transaction = null) => {
  const [filas, catalogo] = await Promise.all([
    MovimientoSucursal.findAll({
      attributes: [
        'producto',
        // MAX y no group by: si un producto quedó cargado con dos
        // categorías distintas, se toma una y no se parte en dos filas.
        [sequelize.literal('MAX(categoria)'), 'categoria'],
        [sequelize.literal('MAX(unidad_medida)'), 'unidad_medida'],
        [sequelize.literal('SUM(cantidad * signo)'), 'cantidad'],
        [sequelize.literal('SUM(COALESCE(piezas, 0) * signo)'), 'piezas'],
      ],
      where: { sucursal_id: sucursalId },
      group: ['producto'],
      raw: true,
      transaction,
    }),
    ProductoSucursal
      ? ProductoSucursal.findAll({ where: { sucursal_id: sucursalId, activo: true }, transaction })
      : [],
  ]);

  const porNombre = new Map(catalogo.map((p) => [p.nombre.toLowerCase(), p]));
  const resultado = new Map();

  filas.forEach((f) => {
    const ficha = porNombre.get(String(f.producto).toLowerCase());
    resultado.set(f.producto, {
      producto: f.producto,
      producto_id: ficha?.id || null,
      categoria: ficha?.categoria || f.categoria || 'Sin categoría',
      unidad_medida: ficha?.unidad_medida || f.unidad_medida || 'kg',
      precio_venta: ficha?.precio_venta === null || ficha?.precio_venta === undefined ? null : Number(ficha.precio_venta),
      cantidad: redondearKg(f.cantidad),
      piezas: Number(f.piezas) || 0,
    });
  });

  // Los del catálogo que todavía no tienen movimientos: en cero, pero
  // visibles, porque si no no hay forma de cargarlos.
  catalogo.forEach((p) => {
    if (resultado.has(p.nombre)) return;
    resultado.set(p.nombre, {
      producto: p.nombre,
      producto_id: p.id,
      categoria: p.categoria || 'Sin categoría',
      unidad_medida: p.unidad_medida,
      precio_venta: p.precio_venta === null || p.precio_venta === undefined ? null : Number(p.precio_venta),
      cantidad: 0,
      piezas: 0,
    });
  });

  return [...resultado.values()].sort((a, b) => a.producto.localeCompare(b.producto, 'es'));
};

const existenciaDeProducto = async (sucursalId, producto, transaction = null) => {
  const fila = await MovimientoSucursal.findAll({
    attributes: [[sequelize.literal('SUM(cantidad * signo)'), 'cantidad']],
    where: { sucursal_id: sucursalId, producto },
    raw: true,
    transaction,
  });
  return redondearKg(fila?.[0]?.cantidad);
};

// ============================================================
//  REGISTRAR UNA VENTA
// ============================================================

/** Junta líneas repetidas del mismo producto y descarta las vacías. */
const consolidarItems = (lista) => {
  const mapa = new Map();
  (lista || []).forEach((i) => {
    const producto = String(i?.producto || '').trim();
    const kilos = Number(i?.kilos);
    const precio = Number(i?.precio_kilo);
    if (!producto || Number.isNaN(kilos) || kilos <= 0) return;

    const clave = `${producto}|${Number.isNaN(precio) ? 0 : precio}`;
    const previo = mapa.get(clave) || { producto, kilos: 0, piezas: 0, precio_kilo: Number.isNaN(precio) ? 0 : precio };
    previo.kilos = redondearKg(previo.kilos + kilos);
    previo.piezas += aEntero(i?.piezas) || 0;
    mapa.set(clave, previo);
  });

  return [...mapa.values()].map((i) => ({
    ...i,
    piezas: i.piezas > 0 ? i.piezas : null,
    subtotal: redondearDinero(i.kilos * i.precio_kilo),
  }));
};

/**
 * Venta desde la planta: descuenta de cuarto frío.
 * Si va a una sucursal, queda pendiente de que ella confirme.
 */
const registrarVentaPlanta = async (datos, usuario) => {
  const items = consolidarItems(datos.items);
  if (items.length === 0) throw new ErrorDeNegocio('Agregue al menos un producto a la venta.');

  let sucursal = null;
  if (datos.sucursal_id) {
    sucursal = await Sucursal.findByPk(datos.sucursal_id);
    if (!sucursal) throw new ErrorDeNegocio('La sucursal no existe.');
    if (!sucursal.activo) throw new ErrorDeNegocio(`${sucursal.nombre} está archivada.`);
  } else if (!String(datos.cliente_nombre || '').trim()) {
    throw new ErrorDeNegocio('Indique a quién se le vende: una sucursal o el nombre del cliente.');
  }

  const moneda = String(datos.moneda || sucursal?.moneda || 'BS').toUpperCase();
  const total = redondearDinero(items.reduce((s, i) => s + i.subtotal, 0));

  return sequelize.transaction(async (transaction) => {
    // Se valida TODO el stock antes de descontar nada: si un producto no
    // alcanza, no sale ninguno.
    const faltantes = [];
    for (const item of items) {
      const disponible = await cuartoFrioService.existenciaDe(item.producto, transaction);
      if (item.kilos > disponible.kilos + 0.0005) {
        faltantes.push(`${item.producto}: se venden ${item.kilos} kg y en cuarto frío hay ${disponible.kilos}`);
      }
    }
    if (faltantes.length > 0) {
      throw new ErrorDeNegocio(`No hay suficiente producto. ${faltantes.join('; ')}.`);
    }

    const venta = await Venta.create(
      {
        fecha: datos.fecha || undefined,
        origen: 'planta',
        sucursal_id: sucursal ? sucursal.id : null,
        cliente_nombre: sucursal ? null : String(datos.cliente_nombre).trim(),
        moneda,
        total,
        metodo_pago: datos.metodo_pago || null,
        referencia: datos.referencia || null,
        notas: datos.notas || null,
        usuario_id: usuario?.id || null,
        // A una sucursal hay que confirmarle la llegada; al cliente de
        // mostrador se le entrega en el momento.
        estado_despacho: sucursal ? 'pendiente' : 'no_aplica',
      },
      { transaction }
    );

    for (const item of items) {
      await VentaItem.create({ ...item, venta_id: venta.id }, { transaction });

      await db.MovimientoCuartoFrio.create(
        {
          fecha: venta.fecha,
          producto: item.producto,
          tipo: 'salida',
          signo: -1,
          kilos: item.kilos,
          piezas: item.piezas,
          descripcion: sucursal
            ? `Despacho a ${sucursal.nombre} — venta #${venta.id}`
            : `Venta a ${venta.cliente_nombre} — #${venta.id}`,
        },
        { transaction }
      );
    }

    return venta;
  });
};

/**
 * Venta de una sucursal a su cliente: descuenta de SU inventario.
 *
 * No se cuenta como ingreso de la cooperativa: esa mercancía ya se cobró
 * cuando se le despachó. Contarla otra vez sería duplicar la venta.
 */
const registrarVentaSucursal = async (datos, usuario) => {
  const sucursalId = Number(usuario?.sucursal_id || datos.sucursal_id);
  if (!sucursalId) throw new ErrorDeNegocio('No se pudo determinar la sucursal.');

  const items = consolidarItems(datos.items);
  if (items.length === 0) throw new ErrorDeNegocio('Agregue al menos un producto a la venta.');

  const sucursal = await Sucursal.findByPk(sucursalId);
  if (!sucursal) throw new ErrorDeNegocio('La sucursal no existe.');

  const moneda = String(datos.moneda || sucursal.moneda || 'BS').toUpperCase();
  const total = redondearDinero(items.reduce((s, i) => s + i.subtotal, 0));

  return sequelize.transaction(async (transaction) => {
    const faltantes = [];
    for (const item of items) {
      const disponible = await existenciaDeProducto(sucursalId, item.producto, transaction);
      if (item.kilos > disponible + 0.0005) {
        const unidad = unidadesActuales.get(item.producto) || 'kg';
        faltantes.push(`${item.producto}: se venden ${item.kilos} ${unidad} y hay ${disponible}`);
      }
    }
    if (faltantes.length > 0) {
      throw new ErrorDeNegocio(`No hay suficiente producto en la sucursal. ${faltantes.join('; ')}.`);
    }

    // Para que la salida quede con la misma categoría con la que entró.
    const existencias = await existenciaSucursal(sucursalId, transaction);
    const categoriasActuales = new Map(existencias.map((p) => [p.producto, p.categoria]));
    const unidadesActuales = new Map(existencias.map((p) => [p.producto, p.unidad_medida]));

    const venta = await Venta.create(
      {
        fecha: datos.fecha || undefined,
        origen: 'sucursal',
        sucursal_id: sucursalId,
        cliente_nombre: datos.cliente_nombre ? String(datos.cliente_nombre).trim() : null,
        moneda,
        total,
        metodo_pago: datos.metodo_pago || null,
        referencia: datos.referencia || null,
        notas: datos.notas || null,
        usuario_id: usuario?.id || null,
        estado_despacho: 'no_aplica',
      },
      { transaction }
    );

    for (const item of items) {
      await VentaItem.create({ ...item, venta_id: venta.id }, { transaction });

      await MovimientoSucursal.create(
        {
          sucursal_id: sucursalId,
          fecha: venta.fecha,
          producto: item.producto,
          tipo: 'venta',
          signo: -1,
          cantidad: item.kilos,
          unidad_medida: unidadesActuales.get(item.producto) || 'kg',
          piezas: item.piezas,
          categoria: categoriasActuales.get(item.producto) || null,
          venta_id: venta.id,
          descripcion: venta.cliente_nombre ? `Venta a ${venta.cliente_nombre}` : `Venta #${venta.id}`,
        },
        { transaction }
      );
    }

    return venta;
  });
};

// ============================================================
//  RECEPCION Y CIERRE DEL DESPACHO
// ============================================================

/**
 * La sucursal anota lo que contó. No ve lo que se envió.
 * conteos: [{ item_id, kilos, piezas }]
 */
const confirmarRecepcion = async (ventaId, conteos, usuario) => {
  return sequelize.transaction(async (transaction) => {
    const venta = await Venta.findByPk(ventaId, {
      include: [{ model: VentaItem, as: 'Items' }],
      transaction,
    });

    if (!venta) throw new ErrorDeNegocio('El despacho no existe.');
    if (venta.estado === 'anulada') throw new ErrorDeNegocio('Ese despacho fue anulado.');
    if (venta.estado_despacho !== 'pendiente') {
      throw new ErrorDeNegocio('Ese despacho ya fue confirmado.');
    }
    // Un usuario de sucursal solo confirma lo suyo.
    if (usuario?.rol === 'sucursal' && Number(venta.sucursal_id) !== Number(usuario.sucursal_id)) {
      throw new ErrorDeNegocio('Ese despacho no es de su sucursal.');
    }

    const porItem = new Map((conteos || []).map((c) => [Number(c.item_id), c]));
    let hayDiferencia = false;

    for (const item of venta.Items) {
      const conteo = porItem.get(Number(item.id));
      if (!conteo || conteo.kilos === undefined || conteo.kilos === null || conteo.kilos === '') {
        throw new ErrorDeNegocio(`Falta anotar cuántos kilos de ${item.producto} recibió.`);
      }

      const kilos = Number(conteo.kilos);
      if (Number.isNaN(kilos) || kilos < 0) {
        throw new ErrorDeNegocio(`Los kilos de ${item.producto} no son válidos.`);
      }

      await item.update(
        { kilos_recibidos: redondearKg(kilos), piezas_recibidas: aEntero(conteo.piezas) },
        { transaction }
      );

      if (Math.abs(kilos - Number(item.kilos)) > TOLERANCIA_KG) hayDiferencia = true;
    }

    await venta.update(
      {
        // Si cuadra se da por recibido; si no, queda esperando que el
        // administrador decida qué hacer con la diferencia.
        estado_despacho: hayDiferencia ? 'diferencia' : 'recibido',
        fecha_recepcion: new Date().toISOString().slice(0, 10),
        recibido_por: usuario?.id || null,
        nota_recepcion: conteos?.nota || null,
      },
      { transaction }
    );

    // Cuando cuadra, la mercancía entra sola al inventario de la sucursal.
    // Cuando no, se espera: meter una cifra en discusión sería empezar a
    // vender sobre un número que todavía nadie aceptó.
    if (!hayDiferencia) {
      await ingresarASucursal(venta, transaction);
      await venta.update({ estado_despacho: 'cerrado', resolucion: 'acepta_enviado' }, { transaction });
    }

    return venta;
  });
};

/** Mete al inventario de la sucursal lo que corresponda de esta venta. */
const ingresarASucursal = async (venta, transaction, usarRecibido = false) => {
  const items = venta.Items || (await VentaItem.findAll({ where: { venta_id: venta.id }, transaction }));

  for (const item of items) {
    const kilos = usarRecibido && item.kilos_recibidos !== null ? Number(item.kilos_recibidos) : Number(item.kilos);
    if (!kilos || kilos <= 0) continue;

    const piezas = usarRecibido && item.piezas_recibidas !== null ? item.piezas_recibidas : item.piezas;

    await MovimientoSucursal.create(
      {
        sucursal_id: venta.sucursal_id,
        fecha: venta.fecha_recepcion || venta.fecha,
        producto: item.producto,
        tipo: 'recepcion',
        signo: 1,
        // Lo que viene de la planta siempre es queso, y va en kilos.
        cantidad: redondearKg(kilos),
        unidad_medida: 'kg',
        piezas,
        categoria: 'De la planta',
        venta_id: venta.id,
        descripcion: `Recibido del despacho #${venta.id}`,
      },
      { transaction }
    );
  }
};

/**
 * El administrador resuelve una diferencia.
 *
 *   acepta_enviado -> manda lo que salió de la planta. La venta no
 *                     cambia y la sucursal recibe esa cantidad.
 *   acepta_recibido -> vale lo que contó la sucursal. Se ajusta la venta
 *                     y su total: se cobra lo que de verdad llegó.
 *   merma_transito -> la venta se mantiene en lo enviado (se le cobra
 *                     completo), pero la sucursal solo carga lo que
 *                     recibió. La diferencia se perdió en el camino.
 */
const resolverDiferencia = async (ventaId, resolucion, nota) => {
  if (!Venta.RESOLUCIONES.includes(resolucion)) {
    throw new ErrorDeNegocio('Indique qué hacer con la diferencia.');
  }

  return sequelize.transaction(async (transaction) => {
    const venta = await Venta.findByPk(ventaId, {
      include: [{ model: VentaItem, as: 'Items' }],
      transaction,
    });

    if (!venta) throw new ErrorDeNegocio('El despacho no existe.');
    if (venta.estado_despacho !== 'diferencia') {
      throw new ErrorDeNegocio('Ese despacho no tiene una diferencia por resolver.');
    }

    if (resolucion === 'acepta_recibido') {
      // Se le cobra lo que llegó: cambian los kilos, los subtotales y el
      // total. Lo que no salió del cuarto frío se devuelve.
      let total = 0;

      for (const item of venta.Items) {
        const recibidos = Number(item.kilos_recibidos || 0);
        const enviados = Number(item.kilos);
        const sobrante = redondearKg(enviados - recibidos);

        if (sobrante > TOLERANCIA_KG) {
          // Volvió a la planta: se reintegra a cuarto frío.
          await db.MovimientoCuartoFrio.create(
            {
              fecha: venta.fecha_recepcion || venta.fecha,
              producto: item.producto,
              tipo: 'salida',
              signo: 1,
              kilos: sobrante,
              venta_id: undefined,
              descripcion: `Devuelto del despacho #${venta.id}`,
            },
            { transaction }
          );
        }

        const subtotal = redondearDinero(recibidos * Number(item.precio_kilo));
        await item.update({ kilos: redondearKg(recibidos), subtotal }, { transaction });
        total += subtotal;
      }

      await venta.update({ total: redondearDinero(total) }, { transaction });
      await ingresarASucursal(venta, transaction, true);
    } else if (resolucion === 'merma_transito') {
      // Se le cobra lo enviado, pero solo carga lo que recibió.
      await ingresarASucursal(venta, transaction, true);
    } else {
      // acepta_enviado: vale lo de la planta.
      await ingresarASucursal(venta, transaction, false);
    }

    await venta.update(
      {
        estado_despacho: 'cerrado',
        resolucion,
        nota_recepcion: nota ? String(nota).trim() : venta.nota_recepcion,
      },
      { transaction }
    );

    return venta;
  });
};

/**
 * La sucursal carga o corrige su inventario a mano.
 *
 * Hace falta porque no todo entra por un despacho: puede haber
 * mercancía de antes de usar el sistema, o una diferencia contra el
 * conteo físico. Queda como 'ajuste' o 'merma', separado de las
 * recepciones, para que después se sepa de dónde salió cada kilo.
 */
const ajustarInventarioSucursal = async (sucursalId, datos) => {
  const producto = String(datos.producto || '').trim();
  const kilos = Number(datos.kilos);
  const suma = datos.suma === true || datos.suma === 'true';

  if (!producto) throw new ErrorDeNegocio('Indique el producto.');
  if (Number.isNaN(kilos) || kilos <= 0) throw new ErrorDeNegocio('Los kilos deben ser mayores a 0.');

  const sucursal = await Sucursal.findByPk(sucursalId);
  if (!sucursal) throw new ErrorDeNegocio('La sucursal no existe.');

  // La unidad la manda el catálogo: si el producto ya existe se respeta
  // la suya, porque mezclar kilos y litros del mismo producto haría que
  // la suma no signifique nada.
  const ficha = ProductoSucursal
    ? await ProductoSucursal.findOne({
        where: sequelize.where(sequelize.fn('lower', sequelize.col('nombre')), producto.toLowerCase()),
      })
    : null;

  let unidad = ficha?.unidad_medida || null;
  if (!unidad) {
    unidad = ProductoSucursal.normalizarUnidad(datos.unidad_medida) || 'kg';
  }
  const categoria = ficha?.categoria || (datos.categoria ? String(datos.categoria).trim() : null);

  return sequelize.transaction(async (transaction) => {
    if (!suma) {
      const disponible = await existenciaDeProducto(sucursalId, producto, transaction);
      if (kilos > disponible + 0.0005) {
        throw new ErrorDeNegocio(
          `No se puede quitar ${kilos} ${unidad}: de ${producto} solo hay ${disponible} ${unidad}.`
        );
      }
    }

    // Si es un producto nuevo, se da de alta en el catálogo con su
    // unidad y su precio: así aparece después al armar la venta.
    if (ProductoSucursal) {
      if (ficha) {
        const cambios = {};
        if (datos.precio_venta !== undefined && datos.precio_venta !== null && datos.precio_venta !== '') {
          cambios.precio_venta = Number(datos.precio_venta);
        }
        if (categoria && !ficha.categoria) cambios.categoria = categoria;
        if (Object.keys(cambios).length > 0) await ficha.update(cambios, { transaction });
      } else {
        await ProductoSucursal.create(
          {
            sucursal_id: sucursalId,
            nombre: producto,
            categoria,
            unidad_medida: unidad,
            precio_venta:
              datos.precio_venta === undefined || datos.precio_venta === null || datos.precio_venta === ''
                ? null
                : Number(datos.precio_venta),
            moneda: sucursal.moneda || 'BS',
          },
          { transaction }
        );
      }
    }

    return MovimientoSucursal.create(
      {
        sucursal_id: sucursalId,
        fecha: datos.fecha || undefined,
        producto,
        // Quitar producto casi siempre es una pérdida; agregarlo es un
        // ajuste de conteo. Se pueden distinguir después en el historial.
        tipo: suma ? 'ajuste' : datos.tipo === 'merma' ? 'merma' : 'ajuste',
        signo: suma ? 1 : -1,
        cantidad: redondearKg(kilos),
        unidad_medida: unidad,
        piezas: aEntero(datos.piezas),
        categoria: categoria || null,
        descripcion: datos.motivo ? String(datos.motivo).trim() : 'Ajuste de inventario',
      },
      { transaction }
    );
  });
};

/** Inventario de TODAS las sucursales, para que el administrador lo vea. */
const inventarioDeTodas = async () => {
  const sucursales = await Sucursal.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });

  return Promise.all(
    sucursales.map(async (s) => {
      const productos = await existenciaSucursal(s.id);
      return {
        sucursal: { id: s.id, nombre: s.nombre, moneda: s.moneda },
        productos,
        totales: {
          productos: productos.length,
          productos_con_existencia: productos.filter((p) => p.cantidad > 0).length,
        },
      };
    })
  );
};

/** Catálogo de productos de una sucursal. */
const listarCatalogo = async (sucursalId) => {
  if (!ProductoSucursal) return [];
  return ProductoSucursal.findAll({
    where: { sucursal_id: sucursalId },
    order: [
      ['activo', 'DESC'],
      ['categoria', 'ASC'],
      ['nombre', 'ASC'],
    ],
  });
};

/** Da de alta o corrige un producto del catálogo. */
const guardarProducto = async (sucursalId, datos, productoId = null) => {
  const nombre = String(datos.nombre || '').trim();
  if (!nombre) throw new ErrorDeNegocio('Escriba el nombre del producto.');

  const unidad = ProductoSucursal.normalizarUnidad(datos.unidad_medida);
  if (!unidad) {
    throw new ErrorDeNegocio(`Unidad no reconocida. Use: ${ProductoSucursal.UNIDADES.join(', ')}.`);
  }

  const sucursal = await Sucursal.findByPk(sucursalId);
  if (!sucursal) throw new ErrorDeNegocio('La sucursal no existe.');

  const campos = {
    sucursal_id: sucursalId,
    nombre,
    categoria: datos.categoria ? String(datos.categoria).trim() : null,
    unidad_medida: unidad,
    precio_venta:
      datos.precio_venta === undefined || datos.precio_venta === null || datos.precio_venta === ''
        ? null
        : Number(datos.precio_venta),
    moneda: String(datos.moneda || sucursal.moneda || 'BS').toUpperCase(),
  };
  if (datos.activo !== undefined) campos.activo = datos.activo === true || datos.activo === 'true';

  if (productoId) {
    const ficha = await ProductoSucursal.findByPk(productoId);
    if (!ficha) throw new ErrorDeNegocio('El producto no existe.');
    if (Number(ficha.sucursal_id) !== Number(sucursalId)) {
      throw new ErrorDeNegocio('Ese producto no es de su sucursal.');
    }

    // Cambiar la unidad con existencia cargada convertiría kilos en
    // litros de un plumazo. Se bloquea en vez de descuadrar el conteo.
    if (ficha.unidad_medida !== unidad) {
      const existencia = await existenciaDeProducto(sucursalId, ficha.nombre);
      if (existencia > 0.0005) {
        throw new ErrorDeNegocio(
          `No se puede cambiar la unidad de ${ficha.nombre}: hay ${existencia} ${ficha.unidad_medida} cargados. Déjelo en cero primero.`
        );
      }
    }

    await ficha.update(campos);
    return ficha;
  }

  const repetido = await ProductoSucursal.findOne({
    where: {
      sucursal_id: sucursalId,
      ...sequelize.where(sequelize.fn('lower', sequelize.col('nombre')), nombre.toLowerCase()),
    },
  });
  if (repetido) throw new ErrorDeNegocio(`Ya existe «${repetido.nombre}» en el catálogo.`);

  return ProductoSucursal.create(campos);
};

/** Anula una venta y deshace lo que movió. */
const anularVenta = async (ventaId, motivo) => {
  return sequelize.transaction(async (transaction) => {
    const venta = await Venta.findByPk(ventaId, {
      include: [{ model: VentaItem, as: 'Items' }],
      transaction,
    });

    if (!venta) throw new ErrorDeNegocio('La venta no existe.');
    if (venta.estado === 'anulada') throw new ErrorDeNegocio('Esa venta ya estaba anulada.');

    if (venta.origen === 'planta') {
      // Vuelve a cuarto frío lo que salió.
      for (const item of venta.Items) {
        await db.MovimientoCuartoFrio.create(
          {
            fecha: venta.fecha,
            producto: item.producto,
            tipo: 'salida',
            signo: 1,
            kilos: Number(item.kilos),
            piezas: item.piezas,
            descripcion: `Anulación de la venta #${venta.id}`,
          },
          { transaction }
        );
      }

      // Y si la sucursal ya lo había cargado, sale de su inventario.
      const recibidos = await MovimientoSucursal.findAll({
        where: { venta_id: venta.id, tipo: 'recepcion', signo: 1 },
        transaction,
      });
      for (const mov of recibidos) {
        await MovimientoSucursal.create(
          {
            sucursal_id: mov.sucursal_id,
            fecha: venta.fecha,
            producto: mov.producto,
            tipo: 'recepcion',
            signo: -1,
            cantidad: mov.cantidad,
            unidad_medida: mov.unidad_medida,
            piezas: mov.piezas,
            venta_id: venta.id,
            descripcion: `Anulación del despacho #${venta.id}`,
          },
          { transaction }
        );
      }
    } else {
      // Venta de sucursal: el producto vuelve a su inventario.
      for (const item of venta.Items) {
        await MovimientoSucursal.create(
          {
            sucursal_id: venta.sucursal_id,
            fecha: venta.fecha,
            producto: item.producto,
            tipo: 'venta',
            signo: 1,
            cantidad: Number(item.kilos),
            piezas: item.piezas,
            venta_id: venta.id,
            descripcion: `Anulación de la venta #${venta.id}`,
          },
          { transaction }
        );
      }
    }

    await venta.update(
      { estado: 'anulada', motivo_anulacion: motivo ? String(motivo).trim() : 'Anulada manualmente' },
      { transaction }
    );

    return venta;
  });
};

module.exports = {
  paraSucursal,
  paraAdmin,
  segunUsuario,
  existenciaSucursal,
  existenciaDeProducto,
  registrarVentaPlanta,
  registrarVentaSucursal,
  confirmarRecepcion,
  resolverDiferencia,
  anularVenta,
  ajustarInventarioSucursal,
  inventarioDeTodas,
  listarCatalogo,
  guardarProducto,
  UNIDADES: ProductoSucursal ? ProductoSucursal.UNIDADES : [],
  TOLERANCIA_KG,
};