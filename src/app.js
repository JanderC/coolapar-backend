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

// Manejo de rutas no encontradas y errores
app.use(notFound);
app.use(errorHandler);

module.exports = app;