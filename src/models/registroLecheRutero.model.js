/**
 * Un renglón por día de la libreta del rutero:
 * Litros | Sobrante | Faltante | Descripción
 * El total de litros de la semana es lo que se multiplica por el precio.
 */
module.exports = (sequelize, DataTypes) => {
  const RegistroLecheRutero = sequelize.define(
    'RegistroLecheRutero',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      rutero_id: { type: DataTypes.INTEGER, allowNull: false },
      semana_id: { type: DataTypes.INTEGER, allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      litros: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: 'Los litros no pueden ser negativos.' } },
      },
      sobrante: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      faltante: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      descripcion: { type: DataTypes.TEXT },
    },
    {
      tableName: 'registro_leche_rutero',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [{ unique: true, fields: ['rutero_id', 'fecha'] }],
    }
  );

  RegistroLecheRutero.associate = (models) => {
    RegistroLecheRutero.belongsTo(models.Transportador, { foreignKey: 'rutero_id', as: 'Rutero' });
    if (models.SemanaPago) {
      RegistroLecheRutero.belongsTo(models.SemanaPago, { foreignKey: 'semana_id', as: 'Semana' });
    }
  };

  return RegistroLecheRutero;
};
