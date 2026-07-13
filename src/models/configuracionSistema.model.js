module.exports = (sequelize, DataTypes) => {
  const ConfiguracionSistema = sequelize.define(
    'ConfiguracionSistema',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      moneda_actual: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'BS',
        validate: {
          isIn: [['BS', 'USD', 'COP']],
        },
      },
    },
    {
      tableName: 'configuracion_sistema',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return ConfiguracionSistema;
};