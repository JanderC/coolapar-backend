const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Usuario = require('./usuario.model')(sequelize, DataTypes);
const Ruta = require('./ruta.model')(sequelize, DataTypes);
const Productor = require('./productor.model')(sequelize, DataTypes);
const SemanaPago = require('./semanaPago.model')(sequelize, DataTypes);
const RegistroLecheProductor = require('./registroLecheProductor.model')(sequelize, DataTypes);
const Transportador = require('./transportador.model')(sequelize, DataTypes);
const RegistroLecheRutero = require('./registroLecheRutero.model')(sequelize, DataTypes);
const PagoRutero = require('./pagoRutero.model')(sequelize, DataTypes);

const db = {
  sequelize,
  Sequelize: require('sequelize'),
  Usuario,
  Ruta,
  Productor,
  SemanaPago,
  RegistroLecheProductor,
  Transportador,
  RegistroLecheRutero,
  PagoRutero,
};

// Relaciones que ya vienen definidas dentro de cada model
// (Productor, Transportador, RegistroLecheProductor, RegistroLecheRutero, PagoRutero).
Object.values(db).forEach((modelo) => {
  if (modelo && typeof modelo.associate === 'function') {
    modelo.associate(db);
  }
});

module.exports = db;