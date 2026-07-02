const { Sequelize } = require('sequelize');
const env = require('./env');

// En Railway, DATABASE_URL viene con SSL requerido en produccion.
const sequelize = new Sequelize(env.databaseUrl, {
  dialect: 'postgres',
  logging: env.nodeEnv === 'development' ? console.log : false,
  dialectOptions:
    env.nodeEnv === 'production'
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }
      : {},
  define: {
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
});

module.exports = sequelize;
