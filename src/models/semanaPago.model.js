module.exports = (sequelize, DataTypes) => {
  const SemanaPago = sequelize.define(
    'SemanaPago',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      fecha_inicio: { type: DataTypes.DATEONLY, allowNull: false },
      fecha_fin: { type: DataTypes.DATEONLY },
      estado: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'abierta',
        validate: { isIn: [['abierta', 'cerrada']] },
      },
    },
    {
      tableName: 'semanas_pago',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return SemanaPago;
};
