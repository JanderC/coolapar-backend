module.exports = (sequelize, DataTypes) => {
  const RegistroLecheProductor = sequelize.define(
    'RegistroLecheProductor',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      productor_id: { type: DataTypes.INTEGER, allowNull: false },
      semana_id: { type: DataTypes.INTEGER, allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      litros: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      precio_litro: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      // Columna calculada por la BD (GENERATED ALWAYS AS litros * precio_litro).
      // No se envia en el INSERT/UPDATE, Postgres la calcula sola.
      subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    },
    {
      tableName: 'registro_leche_productor',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      indexes: [{ unique: true, fields: ['productor_id', 'fecha'] }],
    }
  );

  return RegistroLecheProductor;
};
