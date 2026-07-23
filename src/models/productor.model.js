const MONEDAS = ['BS', 'USD', 'COP'];

module.exports = (sequelize, DataTypes) => {
  const Productor = sequelize.define(
    'Productor',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      nombre: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { notEmpty: { msg: 'El nombre del productor es obligatorio.' } },
      },

      // Zona / ruta de recolección. El color de la RUTA identifica la procedencia.
      ruta_id: { type: DataTypes.INTEGER, allowNull: true },

      // Color del PRODUCTOR: representa el nivel de precio de la leche que entrega.
      // No es único: varios productores con el mismo precio comparten color.
      color_identificativo: {
        type: DataTypes.STRING(7),
        allowNull: true,
        validate: {
          esHex(valor) {
            if (valor === null || valor === undefined || valor === '') return;
            if (!/^#[0-9A-Fa-f]{6}$/.test(valor)) {
              throw new Error('El color debe ser hexadecimal de 6 dígitos, ej: #FF5733');
            }
          },
        },
        comment: 'Color por nivel de precio de la leche. Puede repetirse entre productores.',
      },

      telefono: { type: DataTypes.STRING(30) },
      direccion: { type: DataTypes.STRING(255) },

      precio_litro_base: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        validate: { min: { args: [0], msg: 'El precio no puede ser negativo.' } },
      },

      // Precio de referencia para la leche ácida (más bajo que el normal).
      // Puede quedar vacío si este productor nunca trae leche ácida.
      precio_litro_acida: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        validate: { min: { args: [0], msg: 'El precio de la leche ácida no puede ser negativo.' } },
      },

      moneda: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'BS',
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },

      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
      fecha_registro: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'productores',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  // El alias 'Ruta' es el que consume el frontend como p.Ruta
  Productor.associate = (models) => {
    if (!models.Ruta) return;
    Productor.belongsTo(models.Ruta, { foreignKey: 'ruta_id', as: 'Ruta' });
    models.Ruta.hasMany(Productor, { foreignKey: 'ruta_id', as: 'Productores' });
  };

  Productor.MONEDAS = MONEDAS;

  return Productor;
};

/*
  IMPORTANTE — en models/index.js debe existir el paso que ejecuta las asociaciones:

    Object.keys(db).forEach((nombre) => {
      if (db[nombre].associate) db[nombre].associate(db);
    });

  Si tu index.js ya declara las relaciones a mano, quita el bloque
  Productor.associate de arriba para no duplicar el alias.
*/