const MONEDAS = ['BS', 'USD', 'COP'];
const TIPOS = ['ingreso', 'egreso'];

// Categorias que se pueden cargar a mano en el libro.
const CATEGORIAS_INGRESO = ['venta', 'otro_ingreso'];
const CATEGORIAS_EGRESO = ['nomina', 'adelanto', 'compra_insumo', 'servicio', 'otro_egreso'];
const CATEGORIAS = [...CATEGORIAS_INGRESO, ...CATEGORIAS_EGRESO];

// Como se llama cada categoria en pantalla, para que los reportes y la
// interfaz digan siempre lo mismo.
const ETIQUETAS = {
  venta: 'Venta',
  otro_ingreso: 'Otro ingreso',
  nomina: 'Pago de nómina',
  adelanto: 'Adelanto a empleado',
  compra_insumo: 'Compra de insumos',
  servicio: 'Servicios y gastos',
  otro_egreso: 'Otro egreso',
  // Estas dos no se guardan: las arma caja.service.js leyendo las
  // tablas de pagos que ya existen.
  pago_productor: 'Pago a productor',
  pago_rutero: 'Pago a rutero',
};

module.exports = (sequelize, DataTypes) => {
  const MovimientoCaja = sequelize.define(
    'MovimientoCaja',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      fecha: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },

      tipo: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: { args: [TIPOS], msg: `Tipo inválido. Use: ${TIPOS.join(', ')}` } },
      },

      categoria: {
        type: DataTypes.STRING(25),
        allowNull: false,
        validate: { isIn: { args: [CATEGORIAS], msg: `Categoría inválida. Use: ${CATEGORIAS.join(', ')}` } },
      },

      concepto: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: { notEmpty: { msg: 'Escriba de qué se trata el movimiento.' } },
      },

      // Siempre positivo: la direccion la marca el tipo.
      monto: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        validate: {
          esPositivo(valor) {
            if (Number(valor) <= 0) throw new Error('El monto debe ser mayor a 0.');
          },
        },
      },

      moneda: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'BS',
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },

      metodo_pago: { type: DataTypes.STRING(20), allowNull: true },
      referencia: { type: DataTypes.STRING(60), allowNull: true },
      contraparte: { type: DataTypes.STRING(150), allowNull: true },

      empleado_id: { type: DataTypes.INTEGER, allowNull: true },
      pago_nomina_id: { type: DataTypes.INTEGER, allowNull: true },

      // Solo en los adelantos: el recibo donde ya se descontó. Mientras
      // sea null, el adelanto sigue pendiente.
      descontado_en_id: { type: DataTypes.INTEGER, allowNull: true },

      // Un movimiento anulado no se borra: deja de sumar pero sigue
      // apareciendo en el libro, tachado.
      anulado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      motivo_anulacion: { type: DataTypes.STRING(255), allowNull: true },
      notas: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'movimientos_caja',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  MovimientoCaja.associate = (models) => {
    if (models.PagoNomina) {
      MovimientoCaja.belongsTo(models.PagoNomina, { foreignKey: 'pago_nomina_id', as: 'Recibo' });
    }
  };

  MovimientoCaja.MONEDAS = MONEDAS;
  MovimientoCaja.TIPOS = TIPOS;
  MovimientoCaja.CATEGORIAS = CATEGORIAS;
  MovimientoCaja.CATEGORIAS_INGRESO = CATEGORIAS_INGRESO;
  MovimientoCaja.CATEGORIAS_EGRESO = CATEGORIAS_EGRESO;
  MovimientoCaja.ETIQUETAS = ETIQUETAS;

  return MovimientoCaja;
};
