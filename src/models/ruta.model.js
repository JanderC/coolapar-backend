module.exports = (sequelize, DataTypes) => {
  const Ruta = sequelize.define(
    'Ruta',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      nombre: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      color_identificativo: {
        type: DataTypes.STRING(7),
        allowNull: false,
        unique: true,
      },
      procedencia: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      descripcion: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      activo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: 'rutas',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return Ruta;
};
