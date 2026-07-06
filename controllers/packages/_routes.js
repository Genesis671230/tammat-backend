const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const ctrl = require('./packageApplicationController');

// ---- Auth middleware (adjust the require path to your project) ----
let protect = (req, res, next) => next();
let optionalAuth = (req, res, next) => next();
try {
  const auth = require('../../middleware/auth');
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
        // per-application sub-folder. Create SYNCHRONOUSLY so the folder is
        // guaranteed to exist before multer streams the file into it — the
        // async mkdir callback could otherwise fire after the write began.
        const dir = path.join(UPLOAD_DIR, String(req.params.id || 'misc'));
        try { fs.mkdirSync(dir, { recursive: true }); cb(null, dir); }
        catch (err) { cb(err, dir); }
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
router.post('/', optionalAuth, ctrl.createPackageApplication);
router.post('/:id/documents', optionalAuth, upload.any(), ctrl.uploadPackageDocuments);
router.get('/:id', optionalAuth, ctrl.getPackageApplication);

// ---- Authenticated (customer) ----
router.get('/me/list', protect, ctrl.getMyPackageApplications);
router.post('/:id/comments', protect, ctrl.addPackageComment);

// ---- Admin / Amer ----
router.get('/', protect, ctrl.listPackageApplications);
router.patch('/:id/status', protect, ctrl.updatePackageStatus);
router.post('/:id/request-documents', protect, ctrl.requestPackageDocuments);
router.patch('/:id/payment', protect, ctrl.updatePackagePayment);
router.get('/:id/documents/:docId/download', protect, ctrl.downloadPackageDocument);

module.exports = router;