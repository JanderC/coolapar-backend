const MONEDAS = ['BS', 'USD', 'COP'];

module.exports = (sequelize, DataTypes) => {
  const PagoRutero = sequelize.define(
    'PagoRutero',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      rutero_id: { type: DataTypes.INTEGER, allowNull: false },
      semana_id: { type: DataTypes.INTEGER, allowNull: false },
      total_litros: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      precio_litro: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      moneda: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'COP',
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },
      total_pagar: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      total_sobrante: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      total_faltante: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      estado_pago: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pendiente',
        validate: { isIn: [['pendiente', 'pagado']] },
      },
      fecha_pago: { type: DataTypes.DATEONLY },
      observaciones: { type: DataTypes.TEXT },
    },
    {
      tableName: 'pagos_ruteros',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [{ unique: true, fields: ['rutero_id', 'semana_id'] }],
    }
  );

  PagoRutero.associate = (models) => {
    PagoRutero.belongsTo(models.Transportador, { foreignKey: 'rutero_id', as: 'Rutero' });
    if (models.SemanaPago) {
      PagoRutero.belongsTo(models.SemanaPago, { foreignKey: 'semana_id', as: 'Semana' });
    }
  };

  return PagoRutero;
};
