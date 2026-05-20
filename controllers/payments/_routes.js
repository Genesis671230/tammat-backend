// controllers/services/payments/_routes.js
//
// Routes file — auth-protected endpoints ONLY.
// The webhook is registered in app.js (NOT here) because:
//   1. Stripe doesn't send JWT auth — would fail router.use(auth)
//   2. Stripe needs raw body, not JSON-parsed
// Both requirements are handled in app.js with express.raw().

const express = require('express');
const router = express.Router();
const auth = require('../../middelwares/auth'); // adjust path if needed
const controller = require('./paymentsController');

// All routes below require authentication
router.use(auth);

// ─── Flow A: Stripe Checkout (hosted page) ─────────────────────────────────
router.post('/checkout-session', controller.createCheckoutSession);
router.get('/checkout-session/:sessionId/verify', controller.verifyCheckoutSession);

// ─── Flow B: Stripe Elements (embedded card form) ──────────────────────────
router.post('/subscriptions', controller.createSubscription);
router.post('/subscriptions/:subId/sync', controller.syncSubscription);

// ─── Subscription management ───────────────────────────────────────────────
router.get('/subscriptions/current', controller.getCurrentSubscription);
router.post('/subscriptions/cancel', controller.cancelSubscription);
router.post('/subscriptions/resume', controller.resumeSubscription);

// ─── Customer Portal (Stripe-hosted manage page) ───────────────────────────
router.post('/portal-session', controller.createPortalSession);

module.exports = router;