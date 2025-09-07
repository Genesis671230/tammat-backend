const express = require('express');
const router = express.Router();
const auth = require('../../middelwares/auth');

let stripe = null;
try {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || '');
} catch {}

router.use(auth);

router.post('/create-intent', async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ success: false, message: 'Payments unavailable' });
    const { amount, currency = 'aed', metadata = {} } = req.body || {};
    if (!amount || amount < 100) return res.status(400).json({ success: false, message: 'Invalid amount' });
    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      metadata,
      automatic_payment_methods: { enabled: true },
      receipt_email: req.user.email,
    });
    res.json({ success: true, data: { clientSecret: intent.client_secret, id: intent.id } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;


