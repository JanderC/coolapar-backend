const MONEDAS = ['BS', 'USD', 'COP'];

module.exports = (sequelize, DataTypes) => {
  const RegistroLecheProductor = sequelize.define(
    'RegistroLecheProductor',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      productor_id: { type: DataTypes.INTEGER, allowNull: false },
      semana_id: { type: DataTypes.INTEGER, allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      litros: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: { min: { args: [0], msg: 'Los litros no pueden ser negativos.' } },
      },
      precio_litro: { type: DataTypes.DECIMAL(10, 2), allowNull: false },

      // La moneda se elige al cargar la semana; no se hereda del productor.
      moneda: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'BS',
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },

      // Columna calculada por Postgres (GENERATED ALWAYS AS litros * precio_litro).
      // Se marca como no escribible para que Sequelize nunca la mande en el INSERT.
      subtotal: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        set() {
          /* no-op: si el cliente manda subtotal, se ignora */
        },
      },
    },
    {
      tableName: 'registro_leche_productor',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      indexes: [{ unique: true, fields: ['productor_id', 'fecha'] }],
    }
  );

  RegistroLecheProductor.associate = (models) => {
    RegistroLecheProductor.belongsTo(models.Productor, { foreignKey: 'productor_id', as: 'Productor' });
    if (models.SemanaPago) {
      RegistroLecheProductor.belongsTo(models.SemanaPago, { foreignKey: 'semana_id', as: 'Semana' });
    }
  };

  return RegistroLecheProductor;
};