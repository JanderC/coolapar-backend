const app = require('./src/app');
const env = require('./src/config/env');
const sequelize = require('./src/config/database');
const logger = require('./src/utils/logger');

const iniciarServidor = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Conexion a la base de datos establecida correctamente.');

    app.listen(env.port, () => {
      logger.info(`Servidor COOLAPAR corriendo en el puerto ${env.port} (${env.nodeEnv})`);
    });
  } catch (error) {
    logger.error('No se pudo iniciar el servidor:', error);
    process.exit(1);
  }
};

iniciarServidor();
