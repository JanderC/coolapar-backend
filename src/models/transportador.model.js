const MONEDAS = ['BS', 'USD', 'COP'];

/**
 * "Rutero" es el nombre que ve el usuario. El modelo se sigue llamando
 * Transportador y la tabla transportadores porque recibidos y
 * fletes_transportador tienen FK contra ella.
 */
module.exports = (sequelize, DataTypes) => {
  const Transportador = sequelize.define(
    'Transportador',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { notEmpty: { msg: 'El nombre del rutero es obligatorio.' } },
      },
      telefono: { type: DataTypes.STRING(30) },

      // Lo que se le paga al rutero por cada litro que trae.
      precio_litro: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: 'El precio por litro no puede ser negativo.' } },
      },

      moneda: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'COP',
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },

      // Se conserva por compatibilidad con el módulo de fletes.
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

  Transportador.associate = (models) => {
    if (models.RegistroLecheRutero) {
      Transportador.hasMany(models.RegistroLecheRutero, { foreignKey: 'rutero_id', as: 'RegistrosLeche' });
    }
    if (models.PagoRutero) {
      Transportador.hasMany(models.PagoRutero, { foreignKey: 'rutero_id', as: 'Pagos' });
    }
  };

  Transportador.MONEDAS = MONEDAS;

  return Transportador;
};