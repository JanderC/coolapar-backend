module.exports = (sequelize, DataTypes) => {
  const ElaboracionProducto = sequelize.define(
    'ElaboracionProducto',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      lote_produccion_id: { type: DataTypes.INTEGER, allowNull: false },
      producto_id: { type: DataTypes.INTEGER, allowNull: false },
      cantidad_piezas: { type: DataTypes.INTEGER },
      kilos_totales: { type: DataTypes.DECIMAL(10, 2) },
    },
    {
      tableName: 'elaboracion_productos',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return ElaboracionProducto;
};
