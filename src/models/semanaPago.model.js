/**
 * Una semana pertenece a un productor o a un rutero.
 * dia_inicio / dia_fin usan la misma numeración que getDay() de JS:
 * 0 = domingo, 1 = lunes ... 6 = sábado.
 * Las fechas existen porque los registros diarios son por fecha,
 * pero en pantalla solo se ven los nombres de los días.
 */
module.exports = (sequelize, DataTypes) => {
  const SemanaPago = sequelize.define(
    'SemanaPago',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      productor_id: { type: DataTypes.INTEGER, allowNull: true },
      rutero_id: { type: DataTypes.INTEGER, allowNull: true },
      fecha_inicio: { type: DataTypes.DATEONLY, allowNull: false },
      fecha_fin: { type: DataTypes.DATEONLY, allowNull: true },
      dia_inicio: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0, max: 6 } },
      dia_fin: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0, max: 6 } },
      estado: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'abierta',
        validate: { isIn: [['abierta', 'cerrada']] },
      },
    },
    {
      tableName: 'semanas_pago',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false, // la tabla solo tiene created_at
    }
  );

  return SemanaPago;
};