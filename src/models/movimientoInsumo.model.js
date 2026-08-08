const MONEDAS = ['BS', 'USD', 'COP'];
const TIPOS = ['entrada', 'salida'];

module.exports = (sequelize, DataTypes) => {
  const MovimientoInsumo = sequelize.define(
    'MovimientoInsumo',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      insumo_id: { type: DataTypes.INTEGER, allowNull: false },

      tipo: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: { args: [TIPOS], msg: `Tipo inválido. Use: ${TIPOS.join(', ')}` } },
      },

      cantidad: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
          esPositiva(valor) {
            if (Number(valor) <= 0) throw new Error('La cantidad debe ser mayor a 0.');
          },
        },
      },

      // Precio y moneda de ESTE movimiento en particular (la moneda puede
      // variar de una compra a otra). Obligatorios cuando tipo='entrada';
      // en una salida normalmente quedan vacíos.
      precio_unitario: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        validate: { min: { args: [0], msg: 'El precio unitario no puede ser negativo.' } },
      },
      moneda: {
        type: DataTypes.STRING(3),
        allowNull: true,
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },

      fecha: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
      descripcion: { type: DataTypes.STRING(255), allowNull: true },

      // Stock del insumo justo despues de aplicar este movimiento. Queda
      // congelado en el momento en que se crea: permite leer el kardex
      // fila por fila sin recalcular acumulados cada vez.
      stock_resultante: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    },
    {
      tableName: 'movimientos_insumo',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  MovimientoInsumo.associate = (models) => {
    if (!models.Insumo) return;
    MovimientoInsumo.belongsTo(models.Insumo, { foreignKey: 'insumo_id', as: 'Insumo' });
  };

  MovimientoInsumo.TIPOS = TIPOS;
  MovimientoInsumo.MONEDAS = MONEDAS;

  return MovimientoInsumo;
};
