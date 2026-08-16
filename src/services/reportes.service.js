const { Op } = require('sequelize');
const db = require('../models');
const { LoteProduccion, Venta, VentaItem, Sucursal } = db;

/**
 * Reportes de venta y rentabilidad.
 *
 * EL COSTO SALE DE LOS LOTES, no de un número cargado a mano:
 *
 *   costo del lote = litros × precio de la leche + insumos gastados
 *   costo por kilo = costo del lote / kilos obtenidos
 *
 * De ahí el costo de un producto es el promedio ponderado de todos sus
 * lotes: no el promedio simple, porque un lote de 200 kg pesa más que
 * uno de 20.
 *
 * LO IMPORTANTE DE LAS MONEDAS: la leche puede pagarse en bolívares y un
 * insumo en dólares. Sumarlos daría un número inventado, así que el
 * costo se lleva separado por moneda y la ganancia se calcula contra la
 * parte que está en la misma moneda de la venta. Cuando hay costos en
 * otra moneda, el reporte lo dice en vez de esconderlo.
 */

const redondear = (n) => Number(Number(n || 0).toFixed(2));
const redondearKg = (n) => Number(Number(n || 0).toFixed(3));

/**
 * Costo por kilo de cada producto, a partir de sus lotes.
 * Devuelve un Map producto -> { kilos_producidos, costo_por_moneda, costo_kg_por_moneda, ... }
 */
const costoPorProducto = async ({ fecha_inicio = null, fecha_fin = null } = {}) => {
  const where = { activo: true };
  // Por defecto se miran TODOS los lotes: el queso que se vende hoy pudo
  // haberse fabricado el mes pasado, así que acotar por fecha dejaría
  // productos sin costo.
  if (fecha_inicio && fecha_fin) where.fecha = { [Op.between]: [fecha_inicio, fecha_fin] };

  const lotes = await LoteProduccion.findAll({ where });

  const mapa = new Map();

  lotes.forEach((lote) => {
    const kilos = Number(lote.kilos_obtenidos) || 0;
    if (kilos <= 0) return;

    if (!mapa.has(lote.producto)) {
      mapa.set(lote.producto, {
        producto: lote.producto,
        lotes: 0,
        kilos_producidos: 0,
        litros_utilizados: 0,
        costo_por_moneda: {},
        lotes_sin_precio_leche: 0,
        lotes_sin_insumos: 0,
      });
    }

    const fila = mapa.get(lote.producto);
    fila.lotes += 1;
    fila.kilos_producidos += kilos;
    fila.litros_utilizados += Number(lote.litros_utilizados) || 0;

    // ---- Leche ----
    const precioLeche = Number(lote.precio_litro_leche) || 0;
    if (precioLeche > 0) {
      const moneda = (lote.moneda_leche || 'BS').toUpperCase();
      const costo = (Number(lote.litros_utilizados) || 0) * precioLeche;
      fila.costo_por_moneda[moneda] = redondear((fila.costo_por_moneda[moneda] || 0) + costo);
    } else {
      // Sin precio de leche el costo queda corto. Se cuenta para poder
      // avisarlo: un margen calculado sobre un costo incompleto miente.
      fila.lotes_sin_precio_leche += 1;
    }

    // ---- Insumos ----
    const insumos = Array.isArray(lote.insumos_usados) ? lote.insumos_usados : [];
    if (insumos.length === 0) {
      fila.lotes_sin_insumos += 1;
    }
    insumos.forEach((i) => {
      const costo = Number(i.costo_estimado) || 0;
      if (costo <= 0) return;
      const moneda = (i.moneda_referencia || 'BS').toUpperCase();
      fila.costo_por_moneda[moneda] = redondear((fila.costo_por_moneda[moneda] || 0) + costo);
    });
  });

  // Costo por kilo, moneda por moneda.
  mapa.forEach((fila) => {
    fila.kilos_producidos = redondearKg(fila.kilos_producidos);
    fila.litros_utilizados = redondear(fila.litros_utilizados);
    fila.costo_kg_por_moneda = {};
    Object.entries(fila.costo_por_moneda).forEach(([moneda, total]) => {
      fila.costo_kg_por_moneda[moneda] = Number((total / fila.kilos_producidos).toFixed(4));
    });
    fila.rendimiento_litros_kilo =
      fila.kilos_producidos > 0 ? Number((fila.litros_utilizados / fila.kilos_producidos).toFixed(4)) : 0;
  });

  return mapa;
};

/**
 * Reporte de ventas con su rentabilidad.
 *
 * Solo cuentan las ventas de la PLANTA. Lo que una sucursal le vende a
 * su cliente no se suma: esa mercancía ya se cobró al despachársela, y
 * contarla otra vez duplicaría el ingreso.
 */
const reporteVentas = async ({ fecha_inicio = null, fecha_fin = null, sucursal_id = null } = {}) => {
  const where = { origen: 'planta', estado: 'registrada' };
  if (fecha_inicio && fecha_fin) where.fecha = { [Op.between]: [fecha_inicio, fecha_fin] };
  if (sucursal_id) where.sucursal_id = Number(sucursal_id);

  const ventas = await Venta.findAll({
    where,
    include: [
      { model: VentaItem, as: 'Items', required: false },
      { model: Sucursal, as: 'Sucursal', required: false, attributes: ['id', 'nombre'] },
    ],
  });

  const costos = await costoPorProducto();

  // ---- Agrupar lo vendido por producto ----
  const porProducto = new Map();

  ventas.forEach((venta) => {
    (venta.Items || []).forEach((item) => {
      const kilos = Number(item.kilos) || 0;
      if (kilos <= 0) return;

      if (!porProducto.has(item.producto)) {
        porProducto.set(item.producto, {
          producto: item.producto,
          kilos_vendidos: 0,
          piezas_vendidas: 0,
          ventas: 0,
          ingreso_por_moneda: {},
          precio_kilo_promedio: {},
        });
      }

      const fila = porProducto.get(item.producto);
      fila.kilos_vendidos += kilos;
      fila.piezas_vendidas += Number(item.piezas) || 0;
      fila.ventas += 1;

      const moneda = venta.moneda;
      fila.ingreso_por_moneda[moneda] = redondear((fila.ingreso_por_moneda[moneda] || 0) + Number(item.subtotal));
    });
  });

  // ---- Cruzar con el costo ----
  const productos = [...porProducto.values()].map((fila) => {
    const costo = costos.get(fila.producto) || null;
    fila.kilos_vendidos = redondearKg(fila.kilos_vendidos);

    // Precio promedio realmente cobrado, por moneda.
    Object.entries(fila.ingreso_por_moneda).forEach(([moneda, ingreso]) => {
      fila.precio_kilo_promedio[moneda] = Number((ingreso / fila.kilos_vendidos).toFixed(2));
    });

    // La ganancia se calcula moneda por moneda, comparando el ingreso
    // contra la parte del costo que está en esa misma moneda.
    const rentabilidad = Object.entries(fila.ingreso_por_moneda).map(([moneda, ingreso]) => {
      const costoKg = costo?.costo_kg_por_moneda?.[moneda] || 0;
      const costoTotal = redondear(costoKg * fila.kilos_vendidos);
      const ganancia = redondear(ingreso - costoTotal);

      // Costos en OTRA moneda que no entran en esta cuenta: hay que
      // avisarlos, porque hacen que la ganancia se vea mejor de lo real.
      const otrasMonedas = Object.entries(costo?.costo_kg_por_moneda || {})
        .filter(([m]) => m !== moneda)
        .map(([m, kg]) => ({ moneda: m, costo_kg: kg, costo_total: redondear(kg * fila.kilos_vendidos) }));

      return {
        moneda,
        ingreso: redondear(ingreso),
        costo_kg: costoKg,
        costo_total: costoTotal,
        ganancia,
        margen: ingreso > 0 ? Number(((ganancia / ingreso) * 100).toFixed(2)) : null,
        // Sin costo no hay margen que valga: se dice y no se inventa un 100%.
        sin_costo: costoTotal <= 0,
        costos_en_otra_moneda: otrasMonedas,
      };
    });

    return {
      ...fila,
      costo_conocido: Boolean(costo),
      kilos_producidos: costo?.kilos_producidos || 0,
      rendimiento_litros_kilo: costo?.rendimiento_litros_kilo || null,
      lotes_sin_precio_leche: costo?.lotes_sin_precio_leche || 0,
      rentabilidad,
    };
  });

  // ---- Ordenar: el más vendido primero ----
  productos.sort((a, b) => b.kilos_vendidos - a.kilos_vendidos);

  // ---- Totales generales ----
  const totalesMoneda = new Map();
  productos.forEach((p) => {
    p.rentabilidad.forEach((r) => {
      if (!totalesMoneda.has(r.moneda)) {
        totalesMoneda.set(r.moneda, { moneda: r.moneda, ingreso: 0, costo: 0, ganancia: 0 });
      }
      const t = totalesMoneda.get(r.moneda);
      t.ingreso = redondear(t.ingreso + r.ingreso);
      t.costo = redondear(t.costo + r.costo_total);
      t.ganancia = redondear(t.ganancia + r.ganancia);
    });
  });

  const totales = [...totalesMoneda.values()].map((t) => ({
    ...t,
    margen: t.ingreso > 0 ? Number(((t.ganancia / t.ingreso) * 100).toFixed(2)) : null,
  }));

  // ---- Por sucursal, para saber quién compra más ----
  const porSucursal = new Map();
  ventas.forEach((v) => {
    const nombre = v.Sucursal?.nombre || v.cliente_nombre || 'Venta directa';
    const clave = `${nombre}|${v.moneda}`;
    const acumulado = porSucursal.get(clave) || { nombre, moneda: v.moneda, ventas: 0, total: 0, kilos: 0 };
    acumulado.ventas += 1;
    acumulado.total = redondear(acumulado.total + Number(v.total));
    acumulado.kilos = redondearKg(
      acumulado.kilos + (v.Items || []).reduce((s, i) => s + (Number(i.kilos) || 0), 0)
    );
    porSucursal.set(clave, acumulado);
  });

  const masVendido = productos[0] || null;

  return {
    rango: { fecha_inicio, fecha_fin },
    productos,
    totales_por_moneda: totales.sort((a, b) => a.moneda.localeCompare(b.moneda)),
    por_cliente: [...porSucursal.values()].sort((a, b) => b.total - a.total),
    resumen: {
      ventas: ventas.length,
      productos: productos.length,
      kilos_vendidos: redondearKg(productos.reduce((s, p) => s + p.kilos_vendidos, 0)),
      mas_vendido: masVendido
        ? { producto: masVendido.producto, kilos: masVendido.kilos_vendidos }
        : null,
      // Productos vendidos de los que no se conoce el costo: su margen
      // no se puede calcular y conviene que salte a la vista.
      sin_costo: productos.filter((p) => !p.costo_conocido).map((p) => p.producto),
    },
  };
};

module.exports = { costoPorProducto, reporteVentas };
