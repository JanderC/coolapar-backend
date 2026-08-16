const ROLES = ['admin', 'operador', 'contabilidad', 'sucursal'];

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
        validate: { isIn: { args: [ROLES], msg: `Rol inválido. Use: ${ROLES.join(', ')}` } },
      },

      // Solo para el rol 'sucursal': a qué sucursal pertenece. Es lo que
      // ata cada consulta suya a sus propios datos; un usuario de
      // sucursal sin esto vería los despachos de todas.
      sucursal_id: { type: DataTypes.INTEGER, allowNull: true },

      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: 'usuarios',
      validate: {
        // La misma regla que el CHECK de la base de datos, para que el
        // error salga con un mensaje legible antes de llegar a Postgres.
        sucursalObligatoriaParaSucursal() {
          if (this.rol === 'sucursal' && !this.sucursal_id) {
            throw new Error('Un usuario de sucursal debe tener una sucursal asignada.');
          }
          if (this.rol !== 'sucursal' && this.sucursal_id) {
            throw new Error('Solo los usuarios con rol «sucursal» pueden estar asignados a una sucursal.');
          }
        },
      },
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  Usuario.ROLES = ROLES;

  return Usuario;
};