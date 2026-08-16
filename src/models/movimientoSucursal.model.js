const TIPOS = ['recepcion', 'venta', 'merma', 'ajuste'];

module.exports = (sequelize, DataTypes) => {
  const MovimientoSucursal = sequelize.define(
    'MovimientoSucursal',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      sucursal_id: { type: DataTypes.INTEGER, allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
      producto: { type: DataTypes.STRING(100), allowNull: false },

      tipo: {
        type: DataTypes.STRING(15),
        allowNull: false,
        validate: { isIn: { args: [TIPOS], msg: `Tipo inválido. Use: ${TIPOS.join(', ')}` } },
      },

      // +1 suma al inventario de la sucursal, -1 resta.
      signo: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        validate: {
          esUnoOMenosUno(valor) {
            if (Number(valor) !== 1 && Number(valor) !== -1) throw new Error('El signo debe ser 1 o -1.');
          },
        },
      },

      // Se llama cantidad y no kilos porque una sucursal mueve harina en
      // kilos, aceite en litros y refrescos por unidad. La unidad la
      // define el producto en su catálogo; aquí se copia para que el
      // movimiento se siga entendiendo aunque el catálogo cambie.
      cantidad: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        validate: {
          esPositivo(valor) {
            if (Number(valor) <= 0) throw new Error('La cantidad debe ser mayor a 0.');
          },
        },
      },
      unidad_medida: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'kg' },

      piezas: { type: DataTypes.INTEGER, allowNull: true },

      // Para agrupar: "De la planta", "Víveres", "Bebidas"... Las
      // sucursales venden mucho más que queso, y sin esto el inventario
      // se vuelve una lista larga y plana.
      categoria: { type: DataTypes.STRING(60), allowNull: true },

      venta_id: { type: DataTypes.INTEGER, allowNull: true },
      descripcion: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'movimientos_sucursal',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  MovimientoSucursal.associate = (models) => {
    if (models.Sucursal) {
      MovimientoSucursal.belongsTo(models.Sucursal, { foreignKey: 'sucursal_id', as: 'Sucursal' });
    }
  };

  MovimientoSucursal.TIPOS = TIPOS;

  return MovimientoSucursal;
};