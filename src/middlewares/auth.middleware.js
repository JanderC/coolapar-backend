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

/**
 * Ata la peticion a la sucursal del usuario.
 *
 * Deja en req.sucursalFiltro:
 *   - null            si es admin, operador o contabilidad (ven todo)
 *   - el id propio    si es un usuario de sucursal
 *
 * Toda consulta que pueda devolver datos de varias sucursales tiene que
 * pasar por aqui y filtrar con ese valor. Es la unica forma de que un
 * usuario de sucursal no alcance lo de otra: esconderlo en la pantalla
 * no sirve de nada, porque la respuesta viaja igual y se puede leer.
 */
const alcanceSucursal = (req, res, next) => {
  if (!req.usuario) {
    return res.status(401).json({ success: false, message: 'No autorizado.' });
  }

  if (req.usuario.rol === 'sucursal') {
    if (!req.usuario.sucursal_id) {
      // Un usuario de sucursal sin sucursal no puede ver nada: si se le
      // dejara pasar, el filtro quedaria vacio y veria todo.
      return res.status(403).json({
        success: false,
        message: 'Su usuario no tiene una sucursal asignada. Avise al administrador.',
      });
    }
    req.sucursalFiltro = Number(req.usuario.sucursal_id);
  } else {
    req.sucursalFiltro = null;
  }

  next();
};

/** Solo para pantallas exclusivas de sucursal. */
const soloSucursal = (req, res, next) => {
  if (!req.usuario || req.usuario.rol !== 'sucursal') {
    return res.status(403).json({ success: false, message: 'Esta sección es solo para sucursales.' });
  }
  if (!req.usuario.sucursal_id) {
    return res.status(403).json({
      success: false,
      message: 'Su usuario no tiene una sucursal asignada. Avise al administrador.',
    });
  }
  req.sucursalFiltro = Number(req.usuario.sucursal_id);
  next();
};

/** true si el usuario puede ver los datos de TODAS las sucursales. */
const esAdministrativo = (usuario) => ['admin', 'contabilidad', 'operador'].includes(usuario?.rol);

module.exports = { proteger, permitirRoles, alcanceSucursal, soloSucursal, esAdministrativo };