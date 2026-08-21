const MONEDAS = ['BS', 'USD', 'COP'];
const ESTADOS_PAGO = ['pendiente', 'pagado'];

module.exports = (sequelize, DataTypes) => {
  const PagoProductor = sequelize.define(
    'PagoProductor',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      productor_id: { type: DataTypes.INTEGER, allowNull: false },
      semana_id: { type: DataTypes.INTEGER, allowNull: false },

      total_litros: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: 'Los litros no pueden ser negativos.' } },
      },
      total_pagar: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: 'El total a pagar no puede ser negativo.' } },
      },

      // Precio de referencia de la semana (el que se muestra en la hoja
      // de pago). Es informativo: el detalle real vive en cada registro
      // diario de RegistroLecheProductor.
      precio_litro: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        validate: { min: { args: [0], msg: 'El precio no puede ser negativo.' } },
      },

      moneda: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'BS',
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },

      estado_pago: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'pendiente',
        validate: { isIn: { args: [ESTADOS_PAGO], msg: `Estado inválido. Use: ${ESTADOS_PAGO.join(', ')}` } },
      },

      fecha_pago: { type: DataTypes.DATEONLY, allowNull: true },
    },
    {
      tableName: 'pagos_productor',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      // Un único pago por productor+semana: el controller hace
      // findOne + update/create sobre este mismo par.
      indexes: [{ unique: true, fields: ['productor_id', 'semana_id'] }],
    }
  );

  PagoProductor.associate = (models) => {
    PagoProductor.belongsTo(models.Productor, { foreignKey: 'productor_id', as: 'Productor' });
    if (models.SemanaPago) {
      PagoProductor.belongsTo(models.SemanaPago, { foreignKey: 'semana_id', as: 'Semana' });
    }
  };

  PagoProductor.MONEDAS = MONEDAS;
  PagoProductor.ESTADOS_PAGO = ESTADOS_PAGO;

  return PagoProductor;
};