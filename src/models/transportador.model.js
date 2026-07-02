module.exports = (sequelize, DataTypes) => {
  const Transportador = sequelize.define(
    'Transportador',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(150), allowNull: false },
      telefono: { type: DataTypes.STRING(30) },
      tarifa_flete_diario: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: 'transportadores',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return Transportador;
};
