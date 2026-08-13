const MONEDAS = ['BS', 'USD', 'COP'];
const TIPOS_BENEFICIARIO = ['empleado', 'productor', 'rutero', 'otro'];
const ESTADOS = ['abierto', 'pagado', 'anulado'];

module.exports = (sequelize, DataTypes) => {
  const Prestamo = sequelize.define(
    'Prestamo',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      // Un prestamo NO es un adelanto. El adelanto se descuenta del
      // proximo sueldo; el prestamo la persona lo va cancelando por su
      // cuenta, en abonos. Por eso vive en su propia tabla y nunca toca
      // el calculo de la nomina.
      beneficiario_tipo: {
        type: DataTypes.STRING(15),
        allowNull: false,
        validate: { isIn: { args: [TIPOS_BENEFICIARIO], msg: `Tipo inválido. Use: ${TIPOS_BENEFICIARIO.join(', ')}` } },
      },

      empleado_id: { type: DataTypes.INTEGER, allowNull: true },
      productor_id: { type: DataTypes.INTEGER, allowNull: true },

      // Se congela el nombre: si el productor se archiva o se renombra,
      // el prestamo sigue diciendo a quien se le dio.
      beneficiario_nombre: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { notEmpty: { msg: 'Indique a quién se le prestó.' } },
      },

      fecha: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },

      monto: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        validate: {
          esPositivo(valor) {
            if (Number(valor) <= 0) throw new Error('El monto del préstamo debe ser mayor a 0.');
          },
        },
      },

      moneda: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'BS',
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },

      motivo: { type: DataTypes.STRING(255), allowNull: true },
      notas: { type: DataTypes.STRING(255), allowNull: true },

      // El saldo NO se guarda: es monto - abonos, calculado al leer. Un
      // saldo guardado es un saldo que algun dia deja de cuadrar con sus
      // propios abonos.
      estado: {
        type: DataTypes.STRING(15),
        allowNull: false,
        defaultValue: 'abierto',
        validate: { isIn: { args: [ESTADOS], msg: `Estado inválido. Use: ${ESTADOS.join(', ')}` } },
      },
      motivo_anulacion: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'prestamos',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  Prestamo.associate = (models) => {
    if (models.Empleado) Prestamo.belongsTo(models.Empleado, { foreignKey: 'empleado_id', as: 'Empleado' });
    if (models.Productor) Prestamo.belongsTo(models.Productor, { foreignKey: 'productor_id', as: 'Productor' });
    if (models.MovimientoCaja) {
      Prestamo.hasMany(models.MovimientoCaja, { foreignKey: 'prestamo_id', as: 'Movimientos' });
      models.MovimientoCaja.belongsTo(Prestamo, { foreignKey: 'prestamo_id', as: 'Prestamo' });
    }
  };

  Prestamo.MONEDAS = MONEDAS;
  Prestamo.TIPOS_BENEFICIARIO = TIPOS_BENEFICIARIO;
  Prestamo.ESTADOS = ESTADOS;

  return Prestamo;
};
