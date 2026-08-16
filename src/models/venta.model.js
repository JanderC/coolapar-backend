const MONEDAS = ['BS', 'USD', 'COP'];
const ORIGENES = ['planta', 'sucursal'];
const ESTADOS = ['registrada', 'anulada'];
const ESTADOS_DESPACHO = ['no_aplica', 'pendiente', 'recibido', 'diferencia', 'cerrado'];
const RESOLUCIONES = ['acepta_enviado', 'acepta_recibido', 'merma_transito'];

module.exports = (sequelize, DataTypes) => {
  const Venta = sequelize.define(
    'Venta',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      fecha: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },

      // 'planta'   -> descuenta de cuarto frío; es ingreso de la cooperativa.
      // 'sucursal' -> descuenta del inventario de la sucursal. NO vuelve a
      //               contarse como ingreso: esa mercancía ya se cobró al
      //               despacharla.
      origen: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'planta',
        validate: { isIn: { args: [ORIGENES], msg: `Origen inválido. Use: ${ORIGENES.join(', ')}` } },
      },

      sucursal_id: { type: DataTypes.INTEGER, allowNull: true },
      cliente_nombre: { type: DataTypes.STRING(150), allowNull: true },

      moneda: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'BS',
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },
      total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

      metodo_pago: { type: DataTypes.STRING(20), allowNull: true },
      referencia: { type: DataTypes.STRING(60), allowNull: true },
      notas: { type: DataTypes.STRING(255), allowNull: true },

      usuario_id: { type: DataTypes.INTEGER, allowNull: true },

      estado: {
        type: DataTypes.STRING(15),
        allowNull: false,
        defaultValue: 'registrada',
        validate: { isIn: { args: [ESTADOS], msg: `Estado inválido. Use: ${ESTADOS.join(', ')}` } },
      },
      motivo_anulacion: { type: DataTypes.STRING(255), allowNull: true },

      estado_despacho: {
        type: DataTypes.STRING(15),
        allowNull: false,
        defaultValue: 'no_aplica',
        validate: { isIn: { args: [ESTADOS_DESPACHO], msg: 'Estado de despacho inválido.' } },
      },
      fecha_recepcion: { type: DataTypes.DATEONLY, allowNull: true },
      recibido_por: { type: DataTypes.INTEGER, allowNull: true },
      resolucion: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: { isIn: { args: [RESOLUCIONES], msg: 'Resolución inválida.' } },
      },
      nota_recepcion: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'ventas',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  Venta.associate = (models) => {
    if (models.Sucursal) Venta.belongsTo(models.Sucursal, { foreignKey: 'sucursal_id', as: 'Sucursal' });
    if (models.Usuario) Venta.belongsTo(models.Usuario, { foreignKey: 'usuario_id', as: 'Vendedor' });
    if (models.VentaItem) {
      Venta.hasMany(models.VentaItem, { foreignKey: 'venta_id', as: 'Items' });
      models.VentaItem.belongsTo(Venta, { foreignKey: 'venta_id', as: 'Venta' });
    }
  };

  Venta.MONEDAS = MONEDAS;
  Venta.ORIGENES = ORIGENES;
  Venta.ESTADOS_DESPACHO = ESTADOS_DESPACHO;
  Venta.RESOLUCIONES = RESOLUCIONES;

  return Venta;
};
