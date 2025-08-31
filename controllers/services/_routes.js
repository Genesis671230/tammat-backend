const express = require('express');
const router = express.Router();
const servicesController = require('./servicesController');
const auth = require('../../middelwares/auth');
const { requireRole } = require('../../middelwares/auth');

// Public routes - no authentication required
router.get('/categories', servicesController.getCategories);
router.get('/subcategories', servicesController.getSubcategories);
router.get('/services', servicesController.getServices);
router.get('/services/:id', servicesController.getServiceById);
router.get('/search', servicesController.searchServices);
router.get('/stats', servicesController.getStats);

// Protected routes - require authentication
router.post('/services', auth, requireRole('admin', 'amer'), servicesController.createService);
router.put('/services/:id', auth, requireRole('admin', 'amer'), servicesController.updateService);
router.delete('/services/:id', auth, requireRole('admin'), servicesController.deleteService);

// Admin-only routes
router.post('/reload', auth, requireRole('admin'), servicesController.reloadServices);
router.post('/backup', auth, requireRole('admin'), servicesController.backupServices);
router.post('/restore', auth, requireRole('admin'), servicesController.restoreServices);

module.exports = router; 