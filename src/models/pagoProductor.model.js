module.exports = (sequelize, DataTypes) => {
  const PagoProductor = sequelize.define(
    'PagoProductor',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      productor_id: { type: DataTypes.INTEGER, allowNull: false },
      semana_id: { type: DataTypes.INTEGER, allowNull: false },
      total_litros: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      total_pagar: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      estado_pago: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pendiente',
        validate: { isIn: [['pendiente', 'pagado']] },
      },
      fecha_pago: { type: DataTypes.DATEONLY },
    },
    {
      tableName: 'pagos_productores',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      indexes: [{ unique: true, fields: ['productor_id', 'semana_id'] }],
    }
  );

  return PagoProductor;
};
