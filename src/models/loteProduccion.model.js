module.exports = (sequelize, DataTypes) => {
  const LoteProduccion = sequelize.define(
    'LoteProduccion',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      recibido_id: { type: DataTypes.INTEGER },
      litros_utilizados: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      kilos_obtenidos: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      // Calculado por la BD: litros_utilizados / kilos_obtenidos
      // Este es el "historial de porcentaje" (litro/kilo) que pidio la duena.
      porcentaje_litro_kilo: { type: DataTypes.DECIMAL(10, 4), allowNull: true },
      observaciones: { type: DataTypes.TEXT },
    },
    {
      tableName: 'lotes_produccion',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return LoteProduccion;
};
