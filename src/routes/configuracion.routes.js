const express = require('express');
const router = express.Router();
const { obtener, actualizarMoneda } = require('../controllers/configuracion.controller');
const { proteger, permitirRoles } = require('../middlewares/auth.middleware');

// Cualquier usuario autenticado puede leer la moneda activa
router.get('/', proteger, obtener);

// Solo el admin puede cambiar la moneda global del sistema
router.put('/moneda', proteger, permitirRoles('admin'), actualizarMoneda);

module.exports = router;
