module.exports = (sequelize, DataTypes) => {
  const Devolucion = sequelize.define(
    'Devolucion',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      proveedor_id: { type: DataTypes.INTEGER },
      producto_id: { type: DataTypes.INTEGER },
      cantidad: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      motivo: { type: DataTypes.TEXT },
    },
    {
      tableName: 'devoluciones',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return Devolucion;
};
