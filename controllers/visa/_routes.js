const express = require('express');
const router = express.Router();
const visaApplicationController = require('./visaApplicationController');
const auth = require('../../middelwares/auth');
const { requireRole } = require('../../middelwares/auth');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'visa-applications');
    // Ensure directory exists
    if (!require('fs').existsSync(uploadDir)) {
      require('fs').mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and PDF files are allowed.'), false);
    }
  }
});

// User routes (require authentication)
router.post('/applications', auth, visaApplicationController.createVisaApplication);
router.get('/applications/user', auth, visaApplicationController.getUserApplications);
router.get('/applications/:id', auth, visaApplicationController.getApplicationById);
router.put('/applications/:id/submit', auth, visaApplicationController.submitApplication);
router.put('/applications/:id/documents', auth, upload.array('documents', 10), visaApplicationController.uploadDocuments);

// Amer professional routes (require Amer role)
router.get('/applications', auth, requireRole('amer'), visaApplicationController.getAllApplications);
router.put('/applications/:id/status', auth, requireRole('amer'), visaApplicationController.updateApplicationStatus);
router.get('/stats', auth, requireRole('amer'), visaApplicationController.getApplicationStats);

module.exports = router; 