const sequelize = require('./database');
const db = require('../models');

// Este script crea (o actualiza) todas las tablas en la base de datos
// segun los modelos definidos. Se ejecuta con: npm run db:migrate
(async () => {
  try {
    await sequelize.authenticate();
    console.log('Conexion a la base de datos establecida correctamente.');

    // alter:true ajusta las tablas existentes sin borrarlas.
    // Usa force:true SOLO en desarrollo si quieres borrar y recrear todo.
    await db.sequelize.sync({ alter: true });

    console.log('Todas las tablas fueron sincronizadas correctamente.');
    process.exit(0);
  } catch (error) {
    console.error('Error al sincronizar la base de datos:', error);
    process.exit(1);
  }
})();
