// ============================================================
//  SOLO PRUEBAS — borrar al arrancar en produccion.
//  Ver migracion-ajustes-leche-PRUEBAS.sql
// ============================================================
const TIPOS = ['buenos', 'acidos', 'bajo_grasa', 'todos'];

module.exports = (sequelize, DataTypes) => {
  const AjusteLeche = sequelize.define(
    'AjusteLeche',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

      fecha: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },

      tipo: {
        type: DataTypes.STRING(15),
        allowNull: false,
        defaultValue: 'buenos',
        validate: { isIn: { args: [TIPOS], msg: `Tipo inválido. Use: ${TIPOS.join(', ')}` } },
      },

      // Siempre positivo: esta tabla solo resta.
      litros: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
          esPositivo(valor) {
            if (Number(valor) <= 0) throw new Error('Los litros deben ser mayores a 0.');
          },
        },
      },

      motivo: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'ajustes_leche',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  AjusteLeche.TIPOS = TIPOS;

  return AjusteLeche;
};
