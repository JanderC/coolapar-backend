const ESTADOS = ['bueno', 'regular', 'dañado'];

// Sugerencias para agrupar. No es una lista cerrada: si hace falta otra
// categoria se escribe y ya, porque el inventario de mobiliario cambia
// mas seguido de lo que cambia un catalogo.
const CATEGORIAS_SUGERIDAS = [
  'Envases',
  'Mobiliario',
  'Utensilios',
  'Herramientas',
  'Maquinaria',
  'Aseo',
  'Oficina',
  'Otros',
];

module.exports = (sequelize, DataTypes) => {
  const Equipo = sequelize.define(
    'Equipo',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      nombre: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { notEmpty: { msg: 'El nombre del equipo es obligatorio.' } },
      },

      categoria: { type: DataTypes.STRING(60), allowNull: true },

      // Piezas enteras: no hay media pimpina.
      cantidad: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: 'La cantidad no puede ser negativa.' } },
      },

      estado: {
        type: DataTypes.STRING(15),
        allowNull: false,
        defaultValue: 'bueno',
        validate: { isIn: { args: [ESTADOS], msg: `Estado inválido. Use: ${ESTADOS.join(', ')}` } },
      },

      ubicacion: { type: DataTypes.STRING(120), allowNull: true },
      notas: { type: DataTypes.STRING(255), allowNull: true },

      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'equipos',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  // Sin associate: este inventario no se relaciona con nada. Es
  // deliberado — no se descuenta al producir ni entra en la
  // contabilidad, solo dice que hay y cuanto hay.

  Equipo.ESTADOS = ESTADOS;
  Equipo.CATEGORIAS_SUGERIDAS = CATEGORIAS_SUGERIDAS;

  return Equipo;
};
