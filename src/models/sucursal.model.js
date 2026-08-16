const MONEDAS = ['BS', 'USD', 'COP'];

module.exports = (sequelize, DataTypes) => {
  const Sucursal = sequelize.define(
    'Sucursal',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      nombre: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { notEmpty: { msg: 'El nombre de la sucursal es obligatorio.' } },
      },

      encargado: { type: DataTypes.STRING(150), allowNull: true },
      telefono: { type: DataTypes.STRING(30), allowNull: true },
      direccion: { type: DataTypes.STRING(255), allowNull: true },

      // Solo es el valor que viene propuesto al facturarle: cada venta
      // guarda su propia moneda.
      moneda: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'BS',
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },

      notas: { type: DataTypes.STRING(255), allowNull: true },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'sucursales',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  Sucursal.associate = (models) => {
    if (models.Usuario) {
      Sucursal.hasMany(models.Usuario, { foreignKey: 'sucursal_id', as: 'Usuarios' });
      models.Usuario.belongsTo(Sucursal, { foreignKey: 'sucursal_id', as: 'Sucursal' });
    }
  };

  Sucursal.MONEDAS = MONEDAS;

  return Sucursal;
};
