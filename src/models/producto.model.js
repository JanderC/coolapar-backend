module.exports = (sequelize, DataTypes) => {
  const Producto = sequelize.define(
    'Producto',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(100), allowNull: false },
      descripcion: { type: DataTypes.TEXT },
      unidad_medida: { type: DataTypes.STRING(20), defaultValue: 'kg' },
      precio_venta: { type: DataTypes.DECIMAL(10, 2) },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: 'productos',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return Producto;
};
