module.exports = (sequelize, DataTypes) => {
  const VentaItem = sequelize.define(
    'VentaItem',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      venta_id: { type: DataTypes.INTEGER, allowNull: false },

      producto: { type: DataTypes.STRING(100), allowNull: false },

      // Lo que SALIÓ de la planta.
      kilos: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        validate: {
          esPositivo(valor) {
            if (Number(valor) <= 0) throw new Error('Los kilos deben ser mayores a 0.');
          },
        },
      },
      piezas: { type: DataTypes.INTEGER, allowNull: true },

      precio_kilo: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

      // Lo que CONTÓ la sucursal, sin ver lo anterior. Son dos columnas
      // separadas a propósito: el control está en que cuente a ciegas, y
      // si se sobrescribiera el valor original se perdería la comparación.
      kilos_recibidos: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
      piezas_recibidas: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      tableName: 'venta_items',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  /**
   * Lo que puede ver un usuario de sucursal ANTES de confirmar.
   * Nunca incluye kilos, piezas, precio ni subtotal.
   */
  VentaItem.prototype.aCiegas = function aCiegas() {
    return {
      id: this.id,
      venta_id: this.venta_id,
      producto: this.producto,
      kilos_recibidos: this.kilos_recibidos,
      piezas_recibidas: this.piezas_recibidas,
    };
  };

  return VentaItem;
};
