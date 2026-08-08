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

      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
      fecha_registro: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'insumos',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  Insumo.associate = (models) => {
    if (!models.MovimientoInsumo) return;
    Insumo.hasMany(models.MovimientoInsumo, { foreignKey: 'insumo_id', as: 'Movimientos' });
  };

  Insumo.MONEDAS = MONEDAS;

  return Insumo;
};
