module.exports = (sequelize, DataTypes) => {
  const Proveedor = sequelize.define(
    'Proveedor',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(150), allowNull: false },
      tipo_suministro: { type: DataTypes.STRING(100) },
      telefono: { type: DataTypes.STRING(30) },
      direccion: { type: DataTypes.STRING(255) },
      contacto: { type: DataTypes.STRING(150) },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: 'proveedores',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return Proveedor;
};
