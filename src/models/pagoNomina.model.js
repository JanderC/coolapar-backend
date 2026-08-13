const MONEDAS = ['BS', 'USD', 'COP'];
const ESTADOS = ['borrador', 'pagado'];

module.exports = (sequelize, DataTypes) => {
  const PagoNomina = sequelize.define(
    'PagoNomina',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      empleado_id: { type: DataTypes.INTEGER, allowNull: false },

      fecha: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
      periodo_inicio: { type: DataTypes.DATEONLY, allowNull: false },
      periodo_fin: { type: DataTypes.DATEONLY, allowNull: false },

      // Todos los importes quedan congelados en el recibo. Si el mes que
      // viene le suben el sueldo al empleado, este recibo tiene que
      // seguir diciendo lo que se pago ese dia.
      sueldo_base: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      otras_asignaciones: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total_adelantos: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      otras_deducciones: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      neto: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },

      moneda: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'BS',
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },

      metodo_pago: { type: DataTypes.STRING(20), allowNull: true },
      referencia: { type: DataTypes.STRING(60), allowNull: true },
      notas: { type: DataTypes.STRING(255), allowNull: true },

      // Mientras esta en borrador no salio plata y se puede corregir.
      // Al pasar a 'pagado' se anota en el libro de caja.
      estado: {
        type: DataTypes.STRING(15),
        allowNull: false,
        defaultValue: 'borrador',
        validate: { isIn: { args: [ESTADOS], msg: `Estado inválido. Use: ${ESTADOS.join(', ')}` } },
      },

      anulado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      motivo_anulacion: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'pagos_nomina',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  PagoNomina.MONEDAS = MONEDAS;
  PagoNomina.ESTADOS = ESTADOS;

  return PagoNomina;
};
