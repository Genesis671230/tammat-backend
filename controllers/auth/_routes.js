const express = require('express');
const router = express.Router();
const clerkController = require('./clerkController');
const auth = require('../../middelwares/auth');

router.post('/clerk/sync', clerkController.syncClerkUser);
router.get('/me', auth, clerkController.getMe);

module.exports = router; 