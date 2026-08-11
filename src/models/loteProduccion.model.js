module.exports = (sequelize, DataTypes) => {
  const LoteProduccion = sequelize.define(
    'LoteProduccion',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      fecha: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },

      // Ej: "Semiduro", "Queso blanco", "Requeson"...
      producto: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: { notEmpty: { msg: 'El producto es obligatorio.' } },
      },

      // Total de litros que entraron al lote. Es el RECIBIDO (lo realmente
      // medido al llegar), no lo cargado en ruta.
      litros_utilizados: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: { min: { args: [0.01], msg: 'Los litros utilizados deben ser mayores a 0.' } },
      },

      // Opcional, solo para trazabilidad: de donde vinieron esos litros.
      // Ej: [{ "origen": "Yoar", "litros": 200 }, { "origen": "Juan", "litros": 30 }]
      detalle_litros: { type: DataTypes.JSONB, allowNull: true },

      // Total de kilos obtenidos (suma de las piezas pesadas).
      kilos_obtenidos: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
        validate: { min: { args: [0.001], msg: 'Los kilos obtenidos deben ser mayores a 0.' } },
      },

      // Opcional: el peso de cada pieza. Ej: [10, 10, 9, 11]
      detalle_pesos: { type: DataTypes.JSONB, allowNull: true },

      cantidad_unidades: { type: DataTypes.INTEGER, allowNull: true },

      porcentaje_litro_kilo: { type: DataTypes.DECIMAL(8, 4), allowNull: true },

      notas: { type: DataTypes.STRING(255), allowNull: true },

      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: 'lotes_produccion',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return LoteProduccion;
};

