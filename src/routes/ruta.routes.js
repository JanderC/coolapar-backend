const express = require('express');
const router = express.Router();
const { listar, obtener, crear, actualizar, eliminar } = require('../controllers/ruta.controller');
const { proteger, permitirRoles } = require('../middlewares/auth.middleware');

router.get('/', proteger, listar);
router.get('/:id', proteger, obtener);
router.post('/', proteger, permitirRoles('admin', 'operador'), crear);
router.put('/:id', proteger, permitirRoles('admin', 'operador'), actualizar);
router.delete('/:id', proteger, permitirRoles('admin'), eliminar);

module.exports = router;
