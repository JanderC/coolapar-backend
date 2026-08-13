const MONEDAS = ['BS', 'USD', 'COP'];
const FRECUENCIAS = ['semanal', 'quincenal', 'mensual'];

module.exports = (sequelize, DataTypes) => {
  const Empleado = sequelize.define(
    'Empleado',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      nombre: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { notEmpty: { msg: 'El nombre del empleado es obligatorio.' } },
      },

      cedula: { type: DataTypes.STRING(30), allowNull: true },
      cargo: { type: DataTypes.STRING(100), allowNull: true },

      // Sueldo del periodo completo segun su frecuencia: si cobra
      // semanal, es lo que cobra por semana.
      sueldo: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        validate: { min: { args: [0], msg: 'El sueldo no puede ser negativo.' } },
      },

      moneda: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'BS',
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },

      // Cada quien cobra a su ritmo; el recibo propone el periodo segun esto.
      frecuencia_pago: {
        type: DataTypes.STRING(15),
        allowNull: false,
        defaultValue: 'semanal',
        validate: { isIn: { args: [FRECUENCIAS], msg: `Frecuencia inválida. Use: ${FRECUENCIAS.join(', ')}` } },
      },

      telefono: { type: DataTypes.STRING(30), allowNull: true },
      fecha_ingreso: { type: DataTypes.DATEONLY, allowNull: true },
      notas: { type: DataTypes.STRING(255), allowNull: true },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: 'empleados',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  Empleado.associate = (models) => {
    if (models.PagoNomina) {
      Empleado.hasMany(models.PagoNomina, { foreignKey: 'empleado_id', as: 'Pagos' });
      models.PagoNomina.belongsTo(Empleado, { foreignKey: 'empleado_id', as: 'Empleado' });
    }
    if (models.MovimientoCaja) {
      Empleado.hasMany(models.MovimientoCaja, { foreignKey: 'empleado_id', as: 'MovimientosCaja' });
      models.MovimientoCaja.belongsTo(Empleado, { foreignKey: 'empleado_id', as: 'Empleado' });
    }
  };

  Empleado.MONEDAS = MONEDAS;
  Empleado.FRECUENCIAS = FRECUENCIAS;

  return Empleado;
};
