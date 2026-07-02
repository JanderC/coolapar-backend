const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

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

// Rutas principales de la API
app.use('/api', routes);

// Manejo de rutas no encontradas y errores
app.use(notFound);
app.use(errorHandler);

module.exports = app;
