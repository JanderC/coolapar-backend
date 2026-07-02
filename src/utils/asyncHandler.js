// Envuelve funciones async de los controladores para capturar errores
// automaticamente y pasarlos al middleware de manejo de errores.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
