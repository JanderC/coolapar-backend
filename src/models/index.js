const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

// Carga de modelos (cada archivo exporta una funcion (sequelize, DataTypes) => Model)
const Usuario = require('./usuario.model')(sequelize, DataTypes);
const Productor = require('./productor.model')(sequelize, DataTypes);
const SemanaPago = require('./semanaPago.model')(sequelize, DataTypes);
const RegistroLecheProductor = require('./registroLecheProductor.model')(sequelize, DataTypes);
const PagoProductor = require('./pagoProductor.model')(sequelize, DataTypes);
const Transportador = require('./transportador.model')(sequelize, DataTypes);
const FleteTransportador = require('./fleteTransportador.model')(sequelize, DataTypes);
const Recibido = require('./recibido.model')(sequelize, DataTypes);
const RecibidoDetalle = require('./recibidoDetalle.model')(sequelize, DataTypes);
const LoteProduccion = require('./loteProduccion.model')(sequelize, DataTypes);
const Insumo = require('./insumo.model')(sequelize, DataTypes);
const UsoInsumo = require('./usoInsumo.model')(sequelize, DataTypes);
const Producto = require('./producto.model')(sequelize, DataTypes);
const ElaboracionProducto = require('./elaboracionProducto.model')(sequelize, DataTypes);
const CuartoFrio = require('./cuartoFrio.model')(sequelize, DataTypes);
const PiezaQueso = require('./piezaQueso.model')(sequelize, DataTypes);
const HistorialPesoPieza = require('./historialPesoPieza.model')(sequelize, DataTypes);
const Proveedor = require('./proveedor.model')(sequelize, DataTypes);
const CompraProveedor = require('./compraProveedor.model')(sequelize, DataTypes);
const Devolucion = require('./devolucion.model')(sequelize, DataTypes);
const ConfiguracionSistema = require('./configuracionSistema.model')(sequelize, DataTypes);

// =========================
// RELACIONES: PRODUCTORES / SEMANAS / PAGOS
// =========================
SemanaPago.hasMany(RegistroLecheProductor, { foreignKey: 'semana_id' });
RegistroLecheProductor.belongsTo(SemanaPago, { foreignKey: 'semana_id' });

Productor.hasMany(RegistroLecheProductor, { foreignKey: 'productor_id' });
RegistroLecheProductor.belongsTo(Productor, { foreignKey: 'productor_id' });

SemanaPago.hasMany(PagoProductor, { foreignKey: 'semana_id' });
PagoProductor.belongsTo(SemanaPago, { foreignKey: 'semana_id' });

Productor.hasMany(PagoProductor, { foreignKey: 'productor_id' });
PagoProductor.belongsTo(Productor, { foreignKey: 'productor_id' });

// =========================
// RELACIONES: TRANSPORTADORES / FLETES / RECIBIDOS
// =========================
Transportador.hasMany(FleteTransportador, { foreignKey: 'transportador_id' });
FleteTransportador.belongsTo(Transportador, { foreignKey: 'transportador_id' });

Transportador.hasMany(Recibido, { foreignKey: 'transportador_id' });
Recibido.belongsTo(Transportador, { foreignKey: 'transportador_id' });

Recibido.hasMany(RecibidoDetalle, { foreignKey: 'recibido_id' });
RecibidoDetalle.belongsTo(Recibido, { foreignKey: 'recibido_id' });

Productor.hasMany(RecibidoDetalle, { foreignKey: 'productor_id' });
RecibidoDetalle.belongsTo(Productor, { foreignKey: 'productor_id' });

// =========================
// RELACIONES: PRODUCCION / INSUMOS
// =========================
Recibido.hasMany(LoteProduccion, { foreignKey: 'recibido_id' });
LoteProduccion.belongsTo(Recibido, { foreignKey: 'recibido_id' });

LoteProduccion.hasMany(UsoInsumo, { foreignKey: 'lote_produccion_id' });
UsoInsumo.belongsTo(LoteProduccion, { foreignKey: 'lote_produccion_id' });

Insumo.hasMany(UsoInsumo, { foreignKey: 'insumo_id' });
UsoInsumo.belongsTo(Insumo, { foreignKey: 'insumo_id' });

// =========================
// RELACIONES: PRODUCTOS / ELABORACION / CUARTO FRIO
// =========================
LoteProduccion.hasMany(ElaboracionProducto, { foreignKey: 'lote_produccion_id' });
ElaboracionProducto.belongsTo(LoteProduccion, { foreignKey: 'lote_produccion_id' });

Producto.hasMany(ElaboracionProducto, { foreignKey: 'producto_id' });
ElaboracionProducto.belongsTo(Producto, { foreignKey: 'producto_id' });

ElaboracionProducto.hasMany(CuartoFrio, { foreignKey: 'elaboracion_id' });
CuartoFrio.belongsTo(ElaboracionProducto, { foreignKey: 'elaboracion_id' });

CuartoFrio.hasMany(PiezaQueso, { foreignKey: 'cuarto_frio_id' });
PiezaQueso.belongsTo(CuartoFrio, { foreignKey: 'cuarto_frio_id' });

PiezaQueso.hasMany(HistorialPesoPieza, { foreignKey: 'pieza_id' });
HistorialPesoPieza.belongsTo(PiezaQueso, { foreignKey: 'pieza_id' });

// =========================
// RELACIONES: PROVEEDORES / COMPRAS / DEVOLUCIONES
// =========================
Proveedor.hasMany(CompraProveedor, { foreignKey: 'proveedor_id' });
CompraProveedor.belongsTo(Proveedor, { foreignKey: 'proveedor_id' });

Insumo.hasMany(CompraProveedor, { foreignKey: 'insumo_id' });
CompraProveedor.belongsTo(Insumo, { foreignKey: 'insumo_id' });

Proveedor.hasMany(Devolucion, { foreignKey: 'proveedor_id' });
Devolucion.belongsTo(Proveedor, { foreignKey: 'proveedor_id' });

Producto.hasMany(Devolucion, { foreignKey: 'producto_id' });
Devolucion.belongsTo(Producto, { foreignKey: 'producto_id' });

module.exports = {
  sequelize,
  Usuario,
  Productor,
  SemanaPago,
  RegistroLecheProductor,
  PagoProductor,
  Transportador,
  FleteTransportador,
  Recibido,
  RecibidoDetalle,
  LoteProduccion,
  Insumo,
  UsoInsumo,
  Producto,
  ElaboracionProducto,
  CuartoFrio,
  PiezaQueso,
  HistorialPesoPieza,
  Proveedor,
  CompraProveedor,
  Devolucion,
  ConfiguracionSistema,
};