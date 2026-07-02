module.exports = (sequelize, DataTypes) => {
  const PiezaQueso = sequelize.define(
    'PiezaQueso',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      cuarto_frio_id: { type: DataTypes.INTEGER, allowNull: false },
      numero_pieza: { type: DataTypes.STRING(50), allowNull: false },
      peso_inicial: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
      peso_final: { type: DataTypes.DECIMAL(10, 3) },
      fecha_registro: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'piezas_queso',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return PiezaQueso;
};
