// routes/applications.js
const express = require('express');
const Stripe = require('stripe');
const Application = require('../../model/schema/application.js');
const auth = require('../../middelwares/auth.js');
const { requireRole } = require('../../middelwares/auth.js');
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

const router = express.Router();

const PRICING = {
  overstay_fine: { standard: 20, fastTrack: 50 },
  travel_ban: { standard: 20, fastTrack: 50 },
  inside_outside: { standard: 20, fastTrack: 50 },
  absconding: { standard: 20, fastTrack: 50 },
  application_status: { standard: 20, fastTrack: 50 },  
  nawakas: { standard: 20, fastTrack: 50 },
  establishment_card_ban: { standard: 20, fastTrack: 50 },
  expiry_check: { standard: 20, fastTrack: 50 },
};

// Create application + Stripe Checkout Session
router.post('/create', auth, async (req, res) => {
  try {
    const { type, inputData, isFastTrack = false } = req.body;
    if (!PRICING[type]) return res.status(400).json({ error: 'Invalid check type' });

    const priceAed = isFastTrack ? PRICING[type].fastTrack : PRICING[type].standard;

    const application = await Application.create({
      userId: req.user._id,
      type,
      inputData,
      priceAed,
      isFastTrack,
      status: 'pending_payment',
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'aed',
          product_data: {
            name: typeToTitle(type),
            description: isFastTrack ? '24-hour fast-track' : 'Standard 24-48 hours',
          },
          unit_amount: priceAed * 100, // fils
        },
        quantity: 1,
      }],
      success_url: `${process.env.APP_URL}/applications/${application._id}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/applications/${application._id}/cancel`,
      metadata: {
        applicationId: application._id.toString(),
        userId: req.user._id.toString(),
      },
    });

    application.stripePaymentIntentId = session.payment_intent;
    await application.save();

    res.json({ checkoutUrl: session.url, applicationId: application._id });
  } catch (err) {
    console.error('Application create failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stripe webhook — mark as paid
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const applicationId = session.metadata.applicationId;
    await Application.findByIdAndUpdate(applicationId, {
      status: 'paid',
      paidAt: new Date(),
      stripeChargeId: session.payment_intent,
    });
    // TODO: trigger admin notification + customer email
  }

  res.json({ received: true });
});

// User dashboard — list applications
router.get('/mine', auth, async (req, res) => {
  const applications = await Application.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json({ applications });
});

// Single application detail
router.get('/:id', auth, async (req, res) => {
  const app = await Application.findOne({ _id: req.params.id, userId: req.user._id });
  if (!app) return res.status(404).json({ error: 'Not found' });
  res.json({ application: app });
});

function typeToTitle(type) {
  return type.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

module.exports = router;