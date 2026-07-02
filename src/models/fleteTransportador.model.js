module.exports = (sequelize, DataTypes) => {
  const FleteTransportador = sequelize.define(
    'FleteTransportador',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      transportador_id: { type: DataTypes.INTEGER, allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      monto_flete: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      adelanto: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      // Calculado por la BD: monto_flete - adelanto
      monto_neto: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      observaciones: { type: DataTypes.TEXT },
    },
    {
      tableName: 'fletes_transportador',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      indexes: [{ unique: true, fields: ['transportador_id', 'fecha'] }],
    }
  );

  return FleteTransportador;
};
