const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { Usuario } = require('../models');

// Verifica que el request tenga un token JWT valido
const proteger = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No autorizado, falta el token.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.jwtSecret);

    const usuario = await Usuario.findByPk(decoded.id, {
      attributes: { exclude: ['password_hash'] },
    });

    if (!usuario || !usuario.activo) {
      return res.status(401).json({ success: false, message: 'Usuario no valido o inactivo.' });
    }

    req.usuario = usuario;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token invalido o expirado.' });
  }
};

// Restringe el acceso segun el rol del usuario autenticado
const permitirRoles = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para realizar esta accion.',
      });
    }
    next();
  };
};

module.exports = { proteger, permitirRoles };
