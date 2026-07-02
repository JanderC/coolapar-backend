module.exports = (sequelize, DataTypes) => {
  const HistorialPesoPieza = sequelize.define(
    'HistorialPesoPieza',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      pieza_id: { type: DataTypes.INTEGER, allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      peso: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    },
    {
      tableName: 'historial_pesos_piezas',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return HistorialPesoPieza;
};
