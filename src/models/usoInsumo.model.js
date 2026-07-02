module.exports = (sequelize, DataTypes) => {
  const UsoInsumo = sequelize.define(
    'UsoInsumo',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      lote_produccion_id: { type: DataTypes.INTEGER, allowNull: false },
      insumo_id: { type: DataTypes.INTEGER, allowNull: false },
      cantidad_calculada: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        comment: 'litros_utilizados del lote * factor_por_litro del insumo',
      },
      cantidad_real_usada: { type: DataTypes.DECIMAL(10, 4) },
    },
    {
      tableName: 'uso_insumos',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return UsoInsumo;
};
