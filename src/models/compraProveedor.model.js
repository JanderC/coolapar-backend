module.exports = (sequelize, DataTypes) => {
  const CompraProveedor = sequelize.define(
    'CompraProveedor',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      proveedor_id: { type: DataTypes.INTEGER, allowNull: false },
      insumo_id: { type: DataTypes.INTEGER },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      cantidad: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      costo_unitario: { type: DataTypes.DECIMAL(10, 2) },
      // Calculado por la BD: cantidad * costo_unitario
      costo_total: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      observaciones: { type: DataTypes.TEXT },
    },
    {
      tableName: 'compras_proveedores',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return CompraProveedor;
};
