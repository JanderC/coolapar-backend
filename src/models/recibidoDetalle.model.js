module.exports = (sequelize, DataTypes) => {
  const RecibidoDetalle = sequelize.define(
    'RecibidoDetalle',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      recibido_id: { type: DataTypes.INTEGER, allowNull: false },
      productor_id: { type: DataTypes.INTEGER },
      litros_aportados: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      resultado_prueba: { type: DataTypes.STRING(50) },
      observaciones: { type: DataTypes.TEXT },
    },
    {
      tableName: 'recibidos_detalle',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return RecibidoDetalle;
};
