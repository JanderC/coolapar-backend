module.exports = (sequelize, DataTypes) => {
  const TasaCambio = sequelize.define(
    'TasaCambio',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      // Cuántos COP vale 1 USD. Ej: 3000 → 1 USD = 3000 COP.
      usd_a_cop: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        validate: { min: { args: [0.0001], msg: 'La tasa USD → COP debe ser mayor a cero.' } },
      },

      // Cuántos BS vale 1 USD. Ej: 800 → 1 USD = 800 BS.
      usd_a_bs: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        validate: { min: { args: [0.0001], msg: 'La tasa USD → BS debe ser mayor a cero.' } },
      },

      // Cuántos COP vale 1 BS. Ej: 3.2 → 1000 BS = 3200 COP.
      // Es un valor MANUAL e independiente: no se calcula a partir de las
      // otras dos tasas, porque la tienda hace su propio cálculo diario.
      bs_a_cop: {
        type: DataTypes.DECIMAL(14, 6),
        allowNull: false,
        validate: { min: { args: [0.000001], msg: 'La tasa BS → COP debe ser mayor a cero.' } },
      },

      // Quién la actualizó por última vez, solo para trazabilidad.
      actualizado_por: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      tableName: 'tasas_cambio',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  TasaCambio.associate = (models) => {
    if (models.Usuario) {
      TasaCambio.belongsTo(models.Usuario, { foreignKey: 'actualizado_por', as: 'ActualizadoPor' });
    }
  };

  return TasaCambio;
};
