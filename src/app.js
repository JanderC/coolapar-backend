const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const authRoutes = require('./modules/auth/auth');
const rutasRoutes = require('./modules/rutas/rutas');
const productoresRoutes = require('./modules/productores/productores');
const registroLecheRoutes = require('./modules/registroLeche/registroLeche');
const ruterosRoutes = require('./modules/ruteros/ruteros');
const insumosRoutes = require('./modules/insumos/insumos');
const produccionRoutes = require('./modules/produccion/produccion');
const cuartoFrioRoutes = require('./modules/cuartoFrio/cuartoFrio');
const nominaRoutes = require('./modules/nomina/nomina');
const equiposRoutes = require('./modules/equipos/equipos');
const sucursalesRoutes = require('./modules/sucursales/sucursales');
const usuariosRoutes = require('./modules/usuarios/usuarios');
const ventasRoutes = require('./modules/ventas/ventas');
const reportesRoutes = require('./modules/reportes/reportes');

const app = express();

// Middlewares globales
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (env.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

// Ruta de salud (util para Railway)
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'COOLAPAR backend funcionando correctamente.' });
});

// Rutas principales de la API, montadas directo desde modules/
app.use('/api/auth', authRoutes);
app.use('/api/rutas', rutasRoutes);
app.use('/api/productores', productoresRoutes);
app.use('/api/registros-leche', registroLecheRoutes);
app.use('/api/ruteros', ruterosRoutes);
app.use('/api/insumos', insumosRoutes);
app.use('/api/produccion', produccionRoutes);
app.use('/api/cuarto-frio', cuartoFrioRoutes);
app.use('/api/nomina', nominaRoutes);
app.use('/api/equipos', equiposRoutes);
app.use('/api/sucursales', sucursalesRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/reportes', reportesRoutes);

// Manejo de rutas no encontradas y errores
app.use(notFound);
app.use(errorHandler);

module.exports = app;