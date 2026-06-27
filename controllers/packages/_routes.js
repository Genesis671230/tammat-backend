const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const ctrl = require('./packageApplicationController');
const auth = require('../../middelwares/auth');

// ---- Auth middleware (adjust the require path to your project) ----
let protect = (req, res, next) => next();
let optionalAuth = (req, res, next) => next();
try {
  protect = auth.protect || protect;
  optionalAuth = auth.optionalAuth || auth.softAuth || optionalAuth;
} catch (_) {}

// ---- Multer: ensure the upload dir EXISTS (this was the silent-fail bug) ----
const UPLOAD_DIR = path.join(__dirname, '../../uploads/packages');
fs.mkdirSync(UPLOAD_DIR, { recursive: true }); // create on boot, no-op if present

let upload = { any: () => (req, res, next) => next() };
try {
  const multer = require('multer');
  upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        // per-application sub-folder, created on the fly
        const dir = path.join(UPLOAD_DIR, String(req.params.id || 'misc'));
        fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
      },
      filename: (req, file, cb) =>
        cb(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) =>
      file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf'
        ? cb(null, true)
        : cb(new Error('Only images and PDFs allowed'), false),
  });
} catch (_) {}

// ---- Public lead submission ----
router.post('/', ctrl.createPackageApplication);
router.post('/:id/documents', upload.any(), ctrl.uploadPackageDocuments);
router.get('/:id', auth, ctrl.getPackageApplication);

// ---- Authenticated (customer) ----
router.get('/me/list', ctrl.getMyPackageApplications);
router.post('/:id/comments', auth, ctrl.addPackageComment);

// ---- Admin / Amer ----
router.get('/', auth, ctrl.listPackageApplications);
router.patch('/:id/status', auth, ctrl.updatePackageStatus);
router.post('/:id/request-documents', auth, ctrl.requestPackageDocuments);
router.patch('/:id/payment', auth, ctrl.updatePackagePayment);
router.get('/:id/documents/:docId/user/:userId/download', ctrl.downloadPackageDocument);

module.exports = router;