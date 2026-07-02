module.exports = (sequelize, DataTypes) => {
  const CuartoFrio = sequelize.define(
    'CuartoFrio',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      elaboracion_id: { type: DataTypes.INTEGER, allowNull: false },
      fecha_ingreso: { type: DataTypes.DATEONLY, allowNull: false },
      peso_inicial: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      fecha_salida: { type: DataTypes.DATEONLY },
      peso_final: { type: DataTypes.DECIMAL(10, 2) },
      // Calculado por la BD: peso_inicial - peso_final
      perdida_peso: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      estado: {
        type: DataTypes.STRING(20),
        defaultValue: 'en_frio',
        validate: { isIn: [['en_frio', 'retirado']] },
      },
    },
    {
      tableName: 'cuarto_frio',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return CuartoFrio;
};
