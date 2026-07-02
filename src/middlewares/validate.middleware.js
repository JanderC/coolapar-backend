const { validationResult } = require('express-validator');

// Revisa si hubo errores de validacion definidos con express-validator
// en las rutas y corta la ejecucion devolviendo un 400 con los detalles.
const validar = (req, res, next) => {
  const errores = validationResult(req);

  if (!errores.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Datos invalidos',
      errores: errores.array().map((e) => ({ campo: e.path, mensaje: e.msg })),
    });
  }

  next();
};

module.exports = validar;
