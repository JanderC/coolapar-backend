// Nombre de la columna que Postgres calcula sola (GENERATED ALWAYS AS ... STORED).
// Cualquier intento de escribirla revienta con:
//   "cannot insert a non-DEFAULT value into column porcentaje_litro_kilo"
const COLUMNA_GENERADA = 'porcentaje_litro_kilo';

// Quita la columna generada tanto de los valores a guardar como de la lista
// de campos que Sequelize va a incluir en el INSERT/UPDATE. Con esto da igual
// si algun controlador la asigna por error: nunca llega a la consulta.
const quitarColumnaGenerada = (instancia, opciones) => {
  if (instancia && instancia.dataValues) {
    delete instancia.dataValues[COLUMNA_GENERADA];
  }
  if (instancia && typeof instancia.changed === 'function') {
    instancia.changed(COLUMNA_GENERADA, false);
  }
  if (opciones && Array.isArray(opciones.fields)) {
    opciones.fields = opciones.fields.filter((campo) => campo !== COLUMNA_GENERADA);
  }
};

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

      // SOLO LECTURA. En Postgres es GENERATED ALWAYS AS ... STORED:
      //   CASE WHEN kilos_obtenidos > 0
      //        THEN litros_utilizados / kilos_obtenidos
      //        ELSE 0 END
      //
      // allowNull: true para que Sequelize no exija el valor, y SIN
      // defaultValue (un default haria que Sequelize la incluya en el INSERT).
      // En la base de datos la columna sigue siendo NOT NULL y siempre trae
      // valor, porque la calcula Postgres.
      //
      // calculo.service.js -> calcularPorcentajeLitroKilo() replica la misma
      // formula, pero solo para previsualizar o para agregados. No se guarda.
      porcentaje_litro_kilo: { type: DataTypes.DECIMAL(8, 4), allowNull: true },

      notas: { type: DataTypes.STRING(255), allowNull: true },

      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: 'lotes_produccion',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',

      hooks: {
        beforeCreate: quitarColumnaGenerada,
        beforeUpdate: quitarColumnaGenerada,
        beforeSave: quitarColumnaGenerada,
        beforeBulkCreate: (instancias, opciones) => {
          instancias.forEach((instancia) => quitarColumnaGenerada(instancia, null));
          if (opciones && Array.isArray(opciones.fields)) {
            opciones.fields = opciones.fields.filter((campo) => campo !== COLUMNA_GENERADA);
          }
        },
        // Para Model.update({...}, { where }), que no pasa por beforeUpdate.
        beforeBulkUpdate: (opciones) => {
          if (opciones && opciones.attributes) delete opciones.attributes[COLUMNA_GENERADA];
          if (opciones && Array.isArray(opciones.fields)) {
            opciones.fields = opciones.fields.filter((campo) => campo !== COLUMNA_GENERADA);
          }
        },
      },
    }
  );

  return LoteProduccion;
};

/*
  AVISO — no usar sequelize.sync({ alter: true }) con este modelo.

  Con "alter", Sequelize compara el modelo contra la tabla real y puede
  intentar reescribir porcentaje_litro_kilo como una columna normal,
  destruyendo la expresion GENERATED. Los cambios de esquema de esta tabla
  deben hacerse con SQL/migraciones.
*/