module.exports = (sequelize, DataTypes) => {
  const Productor = sequelize.define(
    'Productor',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(150), allowNull: false },
      color_identificativo: {
        type: DataTypes.STRING(7),
        allowNull: false,
        unique: true,
        comment: 'Color hexadecimal, ej: #FF5733',
      },
      telefono: { type: DataTypes.STRING(30) },
      direccion: { type: DataTypes.STRING(255) },
      precio_litro_base: { type: DataTypes.DECIMAL(10, 2) },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
      fecha_registro: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'productores',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return Productor;
};
