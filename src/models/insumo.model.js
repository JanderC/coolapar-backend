module.exports = (sequelize, DataTypes) => {
  const Insumo = sequelize.define(
    'Insumo',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(100), allowNull: false },
      unidad_medida: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'kg' },
      factor_por_litro: {
        type: DataTypes.DECIMAL(10, 6),
        comment: 'Cantidad de insumo usada por litro de leche, ej: sal por litro',
      },
      stock_actual: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
      costo_unitario: { type: DataTypes.DECIMAL(10, 2) },
    },
    {
      tableName: 'insumos',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return Insumo;
};
