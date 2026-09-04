const MONEDAS = ['BS', 'USD', 'COP'];

module.exports = (sequelize, DataTypes) => {
  const Insumo = sequelize.define(
    'Insumo',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      nombre: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { notEmpty: { msg: 'El nombre del insumo es obligatorio.' } },
      },

      // kg, L, unidades, g, ml...
      unidad_medida: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { notEmpty: { msg: 'La unidad de medida es obligatoria (kg, L, unidades...).' } },
      },

      // Precio de referencia: solo informativo, para tener idea del costo
      // antes de registrar la compra real. El precio de cada compra en
      // firme se guarda en su propio movimiento, porque la moneda puede
      // variar de una compra a otra.
      precio_unitario_referencia: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        validate: { min: { args: [0], msg: 'El precio de referencia no puede ser negativo.' } },
      },
      moneda_referencia: {
        type: DataTypes.STRING(3),
        allowNull: true,
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },

      // Debajo de este nivel, el insumo entra en alerta de reposición.
      stock_minimo: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        validate: { min: { args: [0], msg: 'El stock mínimo no puede ser negativo.' } },
      },

      // Se mantiene sola: la actualiza insumos.service.js a partir del
      // kardex de movimientos (entradas/salidas). No se acepta en el
      // body de POST/PUT del catálogo — ver insumos.js normalizarCampos.
      stock_actual: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },

      proveedor: { type: DataTypes.STRING(150), allowNull: true },

      // ---- Conversión: se compra en una unidad, se usa/consume en otra ----
      // Ej: unidad_medida='ml' (lo que ve todo el sistema), unidad_compra='pote',
      // factor_conversion=1000 (1 pote = 1000 ml). Van de a par: si se define
      // una, la otra es obligatoria (ver el validate del modelo, más abajo).
      unidad_compra: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      factor_conversion: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: true,
        validate: { min: { args: [0.0001], msg: 'El factor de conversión debe ser mayor a 0.' } },
      },

      // ---- Dosis por litros de leche (para la calculadora de Producción) ----
      // Ej: dosis_cantidad=10, dosis_referencia_litros=100 -> "10 ml por
      // cada 100 litros de leche". Igual que la conversión, van de a par.
      dosis_cantidad: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: true,
        validate: { min: { args: [0.0001], msg: 'La dosis debe ser mayor a 0.' } },
      },
      dosis_referencia_litros: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        validate: { min: { args: [0.01], msg: 'Los litros de referencia de la dosis deben ser mayores a 0.' } },
      },

      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
      fecha_registro: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'insumos',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',

      // Estas dos reglas valen tanto para crear como para actualizar
      // (Sequelize valida siempre el estado FINAL de la instancia, así
      // que un PUT parcial que solo toca un lado del par también queda
      // cubierto: si ya había unidad_compra guardada y el PUT manda solo
      // factor_conversion, esto ve el objeto completo y no se queja).
      validate: {
        compraCompleta() {
          const tieneUnidad = !!this.unidad_compra;
          const tieneFactor = this.factor_conversion !== null && this.factor_conversion !== undefined;
          if (tieneUnidad !== tieneFactor) {
            throw new Error('Si define una unidad de compra, también debe indicar el factor de conversión (y viceversa).');
          }
        },
        dosisCompleta() {
          const tieneCantidad = this.dosis_cantidad !== null && this.dosis_cantidad !== undefined;
          const tieneReferencia = this.dosis_referencia_litros !== null && this.dosis_referencia_litros !== undefined;
          if (tieneCantidad !== tieneReferencia) {
            throw new Error('Si define una dosis, también debe indicar a cuántos litros de leche corresponde (y viceversa).');
          }
        },
      },
    }
  );

  Insumo.associate = (models) => {
    if (!models.MovimientoInsumo) return;
    Insumo.hasMany(models.MovimientoInsumo, { foreignKey: 'insumo_id', as: 'Movimientos' });
  };

  Insumo.MONEDAS = MONEDAS;

  return Insumo;
};