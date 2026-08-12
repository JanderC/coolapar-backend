const TIPOS = ['produccion', 'devolucion', 'descarte', 'reproceso', 'salida', 'ajuste'];

// Que tipos suman y cuales restan por defecto. El signo se guarda igual en
// su propia columna, porque una correccion es un movimiento del mismo tipo
// con el signo invertido.
const ENTRADAS = ['produccion', 'devolucion', 'ajuste'];
const SALIDAS = ['descarte', 'reproceso', 'salida'];

module.exports = (sequelize, DataTypes) => {
  const MovimientoCuartoFrio = sequelize.define(
    'MovimientoCuartoFrio',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      fecha: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },

      // El mismo texto que usa el lote de produccion ("Semiduro", "Queso
      // blanco"...). El inventario se agrupa por este nombre.
      producto: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: { notEmpty: { msg: 'El producto es obligatorio.' } },
      },

      tipo: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: { args: [TIPOS], msg: `Tipo inválido. Use: ${TIPOS.join(', ')}` } },
      },

      // +1 suma al inventario, -1 resta.
      signo: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        validate: {
          esUnoOMenosUno(valor) {
            if (Number(valor) !== 1 && Number(valor) !== -1) {
              throw new Error('El signo debe ser 1 o -1.');
            }
          },
        },
      },

      // Siempre positivo: la direccion la marca el signo, no la cantidad.
      kilos: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        validate: {
          esPositivo(valor) {
            if (Number(valor) <= 0) throw new Error('Los kilos deben ser mayores a 0.');
          },
        },
      },

      piezas: { type: DataTypes.INTEGER, allowNull: true },

      // produccion -> el lote que lo fabrico
      // reproceso  -> el lote nuevo que se lo comio
      lote_produccion_id: { type: DataTypes.INTEGER, allowNull: true },

      // ---- Solo para devoluciones ----
      cliente: { type: DataTypes.STRING(150), allowNull: true },
      // false = no sirve para reprocesar; entra y se descarta enseguida.
      apto_reproceso: { type: DataTypes.BOOLEAN, allowNull: true },
      motivo: { type: DataTypes.STRING(255), allowNull: true },

      descripcion: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'movimientos_cuarto_frio',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  MovimientoCuartoFrio.associate = (models) => {
    if (!models.LoteProduccion) return;
    MovimientoCuartoFrio.belongsTo(models.LoteProduccion, { foreignKey: 'lote_produccion_id', as: 'Lote' });
    models.LoteProduccion.hasMany(MovimientoCuartoFrio, {
      foreignKey: 'lote_produccion_id',
      as: 'MovimientosCuartoFrio',
    });
  };

  MovimientoCuartoFrio.TIPOS = TIPOS;
  MovimientoCuartoFrio.ENTRADAS = ENTRADAS;
  MovimientoCuartoFrio.SALIDAS = SALIDAS;

  return MovimientoCuartoFrio;
};
