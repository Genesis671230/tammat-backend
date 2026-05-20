const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const auth = require('../../middelwares/auth');
const checksController = require('./checksController');
const { verifyPaymentSucceeded } = require('../payments/paymentsController');
const VisaCheck = require('../../model/schema/visaCheck');

// ---------------------------------------------------------------------------
// optionalAuth — decodes JWT if present; always calls next()
// ---------------------------------------------------------------------------
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

    if (token) {
      const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
      const decoded = jwt.verify(token, secret);
      req.user = decoded;
      req.user._id = decoded.userId;
    }
  } catch {
    // Token present but invalid — treat as unauthenticated
    req.user = undefined;
  }
  next();
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET  /                    → authenticated user's own checks
router.get('/', auth, checksController.getUserChecks);

router.get('/user/:userId', auth, checksController.getUserChecks);
// POST /                    → create a new check (auth optional, supports guest)
router.post(
  '/',
  optionalAuth,
  checksController.uploadCheckFiles,
  checksController.createCheck
);

// GET  /officer/all         → paginated list for amer / admin officers
// MUST be registered BEFORE /:checkId to avoid route shadowing
router.get(
  '/officer/all',
  auth,
  auth.requireRole('amer', 'admin'),
  checksController.getOfficerChecks
);

// GET  /:checkId            → single check detail (auth optional)
router.get('/:checkId', optionalAuth, checksController.getCheckById);

// POST /:checkId/documents  → user/guest uploads supporting docs
router.post(
  '/:checkId/documents/:requestedDocumentId',
  optionalAuth,
  // checksController.uploadCheckFiles,
  ...checksController.uploadCheckDocuments,
);

// PUT  /:checkId/status     → officer updates check status
router.put(
  '/:checkId/status',
  auth,
  auth.requireRole('amer', 'admin'),
  checksController.updateCheckStatus
);

// POST /:checkId/comment    → authenticated user adds a comment
router.post('/:checkId/comment', auth, checksController.addComment);

// POST /:checkId/request-docs → officer requests additional documents from user
router.post(
  '/:checkId/request-docs',
  auth,
  auth.requireRole('amer', 'admin'),
  checksController.requestDocuments
);

// POST /:checkId/result     → officer uploads result documents + sets outcome
router.post(
  '/:checkId/result',
  auth,
  auth.requireRole('amer', 'admin'),
  ...checksController.uploadCheckResult
);

module.exports = router;
