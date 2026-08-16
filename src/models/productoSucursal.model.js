const MONEDAS = ['BS', 'USD', 'COP'];

// Lista cerrada, igual que en insumos: si cada quien escribe la unidad a
// mano, el mismo producto termina con "Kg", "kilos" y "KILOS", y el
// inventario deja de poder sumarse.
const UNIDADES = ['kg', 'g', 'L', 'ml', 'unidades', 'paquetes', 'cajas', 'bultos', 'docenas'];

const SINONIMOS = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  g: 'g', gr: 'g', gramo: 'g', gramos: 'g',
  l: 'L', lt: 'L', lts: 'L', litro: 'L', litros: 'L',
  ml: 'ml', mililitro: 'ml', mililitros: 'ml',
  u: 'unidades', und: 'unidades', unidad: 'unidades', unidades: 'unidades', pieza: 'unidades', piezas: 'unidades',
  paquete: 'paquetes', paquetes: 'paquetes',
  caja: 'cajas', cajas: 'cajas',
  bulto: 'bultos', bultos: 'bultos',
  docena: 'docenas', docenas: 'docenas',
};

/** Deja la unidad en su forma canónica; null si no la reconoce. */
const normalizarUnidad = (valor) => {
  const limpio = String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!limpio) return null;
  return SINONIMOS[limpio] || null;
};

module.exports = (sequelize, DataTypes) => {
  const ProductoSucursal = sequelize.define(
    'ProductoSucursal',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      sucursal_id: { type: DataTypes.INTEGER, allowNull: false },

      nombre: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: { notEmpty: { msg: 'El nombre del producto es obligatorio.' } },
      },

      categoria: { type: DataTypes.STRING(60), allowNull: true },

      // Opcional. Un producto sin código se busca por nombre; con
      // código, el lector lo encuentra de una.
      codigo_barras: { type: DataTypes.STRING(60), allowNull: true },

      // Se elige una vez: todo el movimiento de ese producto queda en
      // esta unidad. Cambiarla después no convierte lo ya cargado.
      unidad_medida: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'kg',
        validate: { isIn: { args: [UNIDADES], msg: `Unidad inválida. Use: ${UNIDADES.join(', ')}` } },
      },

      // Precio propuesto al vender. La venta guarda el suyo, por si ese
      // día se cobró distinto.
      precio_venta: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
        validate: { min: { args: [0], msg: 'El precio no puede ser negativo.' } },
      },
      moneda: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'BS',
        validate: { isIn: { args: [MONEDAS], msg: `Moneda inválida. Use: ${MONEDAS.join(', ')}` } },
      },

      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'productos_sucursal',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  ProductoSucursal.associate = (models) => {
    if (models.Sucursal) {
      ProductoSucursal.belongsTo(models.Sucursal, { foreignKey: 'sucursal_id', as: 'Sucursal' });
      models.Sucursal.hasMany(ProductoSucursal, { foreignKey: 'sucursal_id', as: 'Productos' });
    }
  };

  ProductoSucursal.UNIDADES = UNIDADES;
  ProductoSucursal.MONEDAS = MONEDAS;
  ProductoSucursal.normalizarUnidad = normalizarUnidad;

  return ProductoSucursal;
};