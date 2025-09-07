const express = require('express');
const router = express.Router();
const authController = require('./authController');
const auth = require('../../middelwares/auth');

// Public routes (no authentication required)
router.post('/signup', authController.signup);
router.post('/signin', authController.signin);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/otp/request', authController.requestOtp);
router.post('/otp/verify', authController.verifyOtp);

// Protected routes (authentication required)
router.get('/profile', auth, authController.getProfile);
router.put('/profile', auth, authController.updateProfile);
router.post('/change-password', auth, authController.changePassword);
router.post('/upload-file', auth, authController.uploadFile);
router.get('/documents', auth, authController.getUserDocuments);
router.post('/logout', auth, authController.logout);

// Legacy routes (keeping for backward compatibility)
const clerkController = require('./clerkController');
router.post('/clerk/sync', clerkController.syncClerkUser);
router.get('/me', auth, clerkController.getMe);

module.exports = router; 