module.exports = (sequelize, DataTypes) => {
  const Recibido = sequelize.define(
    'Recibido',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      transportador_id: { type: DataTypes.INTEGER },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      litros_traidos: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      litros_descartados: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      // Calculado por la BD: litros_traidos - litros_descartados
      litros_utiles: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      motivo_descarte: { type: DataTypes.TEXT },
      observaciones: { type: DataTypes.TEXT },
    },
    {
      tableName: 'recibidos',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return Recibido;
};
