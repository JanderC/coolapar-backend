module.exports = (sequelize, DataTypes) => {
  const Usuario = sequelize.define(
    'Usuario',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(150), allowNull: false },
      email: {
        type: DataTypes.STRING(150),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      password_hash: { type: DataTypes.STRING(255), allowNull: false },
      rol: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'operador',
        validate: { isIn: [['admin', 'operador', 'contabilidad']] },
      },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: 'usuarios',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return Usuario;
};
