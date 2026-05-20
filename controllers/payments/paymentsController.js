// // controllers/services/payments/paymentsController.js
// const Stripe = require('stripe');
// const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
// const User = require('../../model/schema/user'); // adjust path

// // ═══════════════════════════════════════════════════════════════════════════
// // PRICE WHITELIST — server-side validation so users can't pass arbitrary lookup keys
// // ═══════════════════════════════════════════════════════════════════════════

// const ALLOWED_LOOKUP_KEYS = new Set([
//   'tammat_monthly',
//   'tammat_yearly',
//   'tammat_2year',
//   'tammat_yearly_eid',
//   'tammat_2year_eid',
// ]);

// // Eid offer cutoff — must match frontend
// const EID_OFFER_END = new Date('2026-05-29T23:59:59+04:00');
// const isEidOfferActive = () => new Date() < EID_OFFER_END;

// // Lookup keys that are only valid during Eid offer window
// const EID_KEYS = new Set(['tammat_yearly_eid', 'tammat_2year_eid']);

// // ═══════════════════════════════════════════════════════════════════════════
// // CUSTOMER MANAGEMENT
// // ═══════════════════════════════════════════════════════════════════════════

// async function getOrCreateStripeCustomer(user) {
//   if (!user) throw new Error('User required');
//   if (user.stripeCustomerId) return user.stripeCustomerId;

//   const customer = await stripe.customers.create({
//     email: user.email,
//     name: user.name || user.fullName,
//     phone: user.phone,
//     metadata: { userId: user._id.toString() },
//   });

//   await User.findByIdAndUpdate(user._id, { stripeCustomerId: customer.id });
//   return customer.id;
// }

// // ═══════════════════════════════════════════════════════════════════════════
// // CREATE SUBSCRIPTION
// // ═══════════════════════════════════════════════════════════════════════════

// /**
//  * POST /api/v1/services/payments/subscriptions
//  * Body: { lookupKey, paymentMethodId }
//  *
//  * Frontend passes a lookup_key like "tammat_yearly" — backend resolves to
//  * the actual Stripe Price ID. This way Price IDs aren't hard-coded anywhere.
//  */
// exports.createSubscription = async (req, res) => {
//   try {
//     if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });

//     const { lookupKey, paymentMethodId } = req.body;

//     // ── Validate lookup key ──
//     if (!lookupKey || !ALLOWED_LOOKUP_KEYS.has(lookupKey)) {
//       return res.status(400).json({ success: false, message: 'Invalid plan' });
//     }

//     // Block Eid prices after the offer ends
//     if (EID_KEYS.has(lookupKey) && !isEidOfferActive()) {
//       return res.status(400).json({
//         success: false,
//         message: 'Eid offer has ended. Please select a regular plan.',
//       });
//     }

//     if (!paymentMethodId) {
//       return res.status(400).json({ success: false, message: 'paymentMethodId required' });
//     }

//     // ── Resolve lookup_key → Price ID via Stripe ──
//     const prices = await stripe.prices.list({
//       lookup_keys: [lookupKey],
//       expand: ['data.product'],
//       limit: 1,
//     });
//     if (prices.data.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: `Price "${lookupKey}" not found in Stripe. Check your Dashboard setup.`,
//       });
//     }
//     const price = prices.data[0];

//     // ── Get-or-create Stripe customer ──
//     const customerId = await getOrCreateStripeCustomer(req.user);

//     // ── Block double-subscription ──
//     const existing = await stripe.subscriptions.list({
//       customer: customerId,
//       status: 'active',
//       limit: 1,
//     });
//     if (existing.data.length > 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'You already have an active subscription. Please cancel it first or use the upgrade flow.',
//       });
//     }

//     // ── Attach payment method to customer + set as default ──
//     await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
//     await stripe.customers.update(customerId, {
//       invoice_settings: { default_payment_method: paymentMethodId },
//     });

//     // ── Create subscription ──
//     const subscription = await stripe.subscriptions.create({
//       customer: customerId,
//       items: [{ price: price.id }],
//       payment_behavior: 'default_incomplete',
//       payment_settings: {
//         save_default_payment_method: 'on_subscription',
//         payment_method_types: ['card'],
//       },
//       expand: ['latest_invoice.payment_intent'],
//       metadata: {
//         userId: req.user._id.toString(),
//         lookupKey,
//       },
//     });

//     await User.findByIdAndUpdate(req.user._id, {
//       stripeSubscriptionId: subscription.id,
//       subscriptionStatus: subscription.status,
//       subscriptionLookupKey: lookupKey,
//     });

//     const invoice = subscription.latest_invoice;
//     const paymentIntent = invoice?.payment_intent;

//     return res.json({
//       success: true,
//       subscriptionId: subscription.id,
//       status: subscription.status,
//       clientSecret: paymentIntent?.client_secret || null,
//       invoiceUrl: invoice?.hosted_invoice_url || null,
//     });
//   } catch (err) {
//     console.error('createSubscription error:', err);
//     return res.status(500).json({ success: false, message: err.message });
//   }
// };

// // ═══════════════════════════════════════════════════════════════════════════
// // GET CURRENT SUBSCRIPTION
// // ═══════════════════════════════════════════════════════════════════════════

// exports.getCurrentSubscription = async (req, res) => {
//   try {
//     if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
//     if (!req.user.stripeSubscriptionId) return res.json({ success: true, subscription: null });

//     const subscription = await stripe.subscriptions.retrieve(req.user.stripeSubscriptionId, {
//       expand: ['items.data.price.product', 'latest_invoice'],
//     });

//     const item = subscription.items.data[0];
//     const price = item.price;

//     return res.json({
//       success: true,
//       subscription: {
//         id: subscription.id,
//         status: subscription.status,
//         currentPeriodEnd: subscription.current_period_end,
//         cancelAtPeriodEnd: subscription.cancel_at_period_end,
//         lookupKey: price.lookup_key,
//         productName: price.product.name,
//         amount: price.unit_amount, // in fils
//         interval: price.recurring.interval,
//         intervalCount: price.recurring.interval_count,
//         latestInvoiceUrl: subscription.latest_invoice?.hosted_invoice_url,
//         latestInvoicePdf: subscription.latest_invoice?.invoice_pdf,
//       },
//     });
//   } catch (err) {
//     console.error('getCurrentSubscription error:', err);
//     return res.status(500).json({ success: false, message: err.message });
//   }
// };

// // ═══════════════════════════════════════════════════════════════════════════
// // CANCEL SUBSCRIPTION
// // ═══════════════════════════════════════════════════════════════════════════

// exports.cancelSubscription = async (req, res) => {
//   try {
//     if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
//     if (!req.user.stripeSubscriptionId) {
//       return res.status(404).json({ success: false, message: 'No active subscription' });
//     }

//     const { immediately = false } = req.body;
//     const subscription = immediately
//       ? await stripe.subscriptions.cancel(req.user.stripeSubscriptionId)
//       : await stripe.subscriptions.update(req.user.stripeSubscriptionId, {
//           cancel_at_period_end: true,
//         });

//     await User.findByIdAndUpdate(req.user._id, { subscriptionStatus: subscription.status });

//     return res.json({
//       success: true,
//       subscription: {
//         id: subscription.id,
//         status: subscription.status,
//         cancelAtPeriodEnd: subscription.cancel_at_period_end,
//       },
//     });
//   } catch (err) {
//     console.error('cancelSubscription error:', err);
//     return res.status(500).json({ success: false, message: err.message });
//   }
// };

// // ═══════════════════════════════════════════════════════════════════════════
// // RESUME (undo cancel-at-period-end before it actually ends)
// // ═══════════════════════════════════════════════════════════════════════════

// exports.resumeSubscription = async (req, res) => {
//   try {
//     if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
//     if (!req.user.stripeSubscriptionId) {
//       return res.status(404).json({ success: false, message: 'No subscription' });
//     }

//     const subscription = await stripe.subscriptions.update(req.user.stripeSubscriptionId, {
//       cancel_at_period_end: false,
//     });

//     return res.json({ success: true, subscription: { id: subscription.id, status: subscription.status } });
//   } catch (err) {
//     console.error('resumeSubscription error:', err);
//     return res.status(500).json({ success: false, message: err.message });
//   }
// };

// // ═══════════════════════════════════════════════════════════════════════════
// // WEBHOOK — keep DB in sync with Stripe truth
// // ═══════════════════════════════════════════════════════════════════════════

// exports.webhookHandler = async (req, res) => {
//   const sig = req.headers['stripe-signature'];
//   let event;

//   try {
//     event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
//   } catch (err) {
//     console.error('Webhook signature failed:', err.message);
//     return res.status(400).send(`Webhook Error: ${err.message}`);
//   }

//   try {
//     switch (event.type) {
//       case 'invoice.paid': {
//         const invoice = event.data.object;
//         const userId = invoice.metadata?.userId;
//         if (userId && invoice.subscription) {
//           await User.findByIdAndUpdate(userId, {
//             subscriptionStatus: 'active',
//             lastPaidAt: new Date(),
//           });
//         }
//         break;
//       }

//       case 'invoice.payment_failed': {
//         const invoice = event.data.object;
//         const userId = invoice.metadata?.userId;
//         if (userId) {
//           await User.findByIdAndUpdate(userId, { subscriptionStatus: 'past_due' });
//           // TODO: send dunning email / WhatsApp
//         }
//         break;
//       }

//       case 'customer.subscription.updated':
//       case 'customer.subscription.deleted': {
//         const subscription = event.data.object;
//         const userId = subscription.metadata?.userId;
//         if (userId) {
//           const update = { subscriptionStatus: subscription.status };
//           if (event.type === 'customer.subscription.deleted') {
//             update.stripeSubscriptionId = null;
//             update.subscriptionLookupKey = null;
//           }
//           await User.findByIdAndUpdate(userId, update);
//         }
//         break;
//       }
//     }

//     return res.json({ received: true });
//   } catch (err) {
//     console.error('Webhook handler error:', err);
//     return res.status(500).send('Webhook handler failed');
//   }
// };


// controllers/services/payments/paymentsController.js
// Pure controller file — exports only. Routes live in _routes.js.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const User = require('../../model/schema/user.js'); // adjust path if needed

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const ALLOWED_LOOKUP_KEYS = new Set([
  'tammat_monthly',
  'tammat_yearly',
  'tammat_2year',
  'tammat_yearly_eid',
  'tammat_2year_eid',
]);

const EID_OFFER_END = new Date('2026-05-29T23:59:59+04:00');
const isEidOfferActive = () => new Date() < EID_OFFER_END;
const EID_KEYS = new Set(['tammat_yearly_eid', 'tammat_2year_eid']);

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function getOrCreateStripeCustomer(user) {
  if (!user) throw new Error('User required');
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || user.fullName,
    phone: user.phone,
    metadata: { userId: user._id.toString() },
  });

  await User.findByIdAndUpdate(user._id, { stripeCustomerId: customer.id });
  return customer.id;
}

// ═══════════════════════════════════════════════════════════════════════════
// FLOW A: STRIPE CHECKOUT (hosted page)
// ═══════════════════════════════════════════════════════════════════════════

exports.createCheckoutSession = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });

    const { lookupKey } = req.body;
    if (!lookupKey || !ALLOWED_LOOKUP_KEYS.has(lookupKey)) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }
    if (EID_KEYS.has(lookupKey) && !isEidOfferActive()) {
      return res.status(400).json({ success: false, message: 'Eid offer has ended.' });
    }

    const prices = await stripe.prices.list({
      lookup_keys: [lookupKey],
      expand: ['data.product'],
      limit: 1,
    });
    if (prices.data.length === 0) {
      return res.status(400).json({ success: false, message: `Price "${lookupKey}" not found.` });
    }

    const customerId = await getOrCreateStripeCustomer(req.user);

    const existing = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });
    if (existing.data.length > 0) {
      return res.status(400).json({ success: false, message: 'Already subscribed.' });
    }

    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: prices.data[0].id, quantity: 1 }],
      success_url: `${frontendBase}/subscribe?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendBase}/subscribe?status=cancelled`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      subscription_data: {
        metadata: { userId: req.user._id.toString(), lookupKey },
      },
      metadata: { userId: req.user._id.toString(), lookupKey },
    });

    return res.json({ success: true, url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('createCheckoutSession error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.verifyCheckoutSession = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });

    const { sessionId } = req.params;
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId required' });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'subscription.latest_invoice'],
    });

    if (session.metadata?.userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Session does not belong to user' });
    }

    if (session.payment_status !== 'paid' || !session.subscription) {
      return res.json({ success: true, paid: false, status: session.payment_status });
    }

    const subscription = session.subscription;

    await User.findByIdAndUpdate(req.user._id, {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: session.customer,
      subscriptionStatus: subscription.status,
      subscriptionLookupKey: session.metadata?.lookupKey,
      lastPaidAt: new Date(),
    });

    return res.json({
      success: true,
      paid: true,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  } catch (err) {
    console.error('verifyCheckoutSession error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FLOW B: STRIPE ELEMENTS
// ═══════════════════════════════════════════════════════════════════════════

exports.createSubscription = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });

    const { lookupKey, paymentMethodId } = req.body;
    if (!lookupKey || !ALLOWED_LOOKUP_KEYS.has(lookupKey)) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }
    if (EID_KEYS.has(lookupKey) && !isEidOfferActive()) {
      return res.status(400).json({ success: false, message: 'Eid offer has ended.' });
    }
    if (!paymentMethodId) {
      return res.status(400).json({ success: false, message: 'paymentMethodId required' });
    }

    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    if (prices.data.length === 0) {
      return res.status(400).json({ success: false, message: `Price "${lookupKey}" not found.` });
    }

    const customerId = await getOrCreateStripeCustomer(req.user);

    const existing = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });
    if (existing.data.length > 0) {
      return res.status(400).json({ success: false, message: 'Already subscribed.' });
    }

    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: prices.data[0].id }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: { userId: req.user._id.toString(), lookupKey },
    });

    await User.findByIdAndUpdate(req.user._id, {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionLookupKey: lookupKey,
    });

    const invoice = subscription.latest_invoice;
    const paymentIntent = invoice?.payment_intent;

    return res.json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      clientSecret: paymentIntent?.client_secret || null,
      invoiceUrl: invoice?.hosted_invoice_url || null,
    });
  } catch (err) {
    console.error('createSubscription error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.syncSubscription = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });

    const { subId } = req.params;
    const subscription = await stripe.subscriptions.retrieve(subId);

    if (subscription.metadata?.userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not your subscription' });
    }

    await User.findByIdAndUpdate(req.user._id, {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionLookupKey: subscription.metadata?.lookupKey,
      lastPaidAt: subscription.status === 'active' ? new Date() : undefined,
    });

    return res.json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  } catch (err) {
    console.error('syncSubscription error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER PORTAL
// ═══════════════════════════════════════════════════════════════════════════

exports.createPortalSession = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    if (!req.user.stripeCustomerId) {
      return res.status(404).json({ success: false, message: 'No Stripe customer found' });
    }

    const { returnUrl } = req.body;
    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';

    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripeCustomerId,
      return_url: returnUrl || `${frontendBase}/customer-dashboard`,
    });

    return res.json({ success: true, url: session.url });
  } catch (err) {
    console.error('createPortalSession error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET CURRENT SUBSCRIPTION (self-healing)
// ═══════════════════════════════════════════════════════════════════════════

exports.getCurrentSubscription = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });

    // Re-fetch user from DB in case JWT is stale
    const dbUser = await User.findById(req.user._id);
    if (!dbUser) return res.status(404).json({ success: false, message: 'User not found' });

    let subscriptionId = dbUser.stripeSubscriptionId;

    // Self-heal: if no sub ID in DB but customer exists, check Stripe
    if (!subscriptionId && dbUser.stripeCustomerId) {
      const subs = await stripe.subscriptions.list({
        customer: dbUser.stripeCustomerId,
        status: 'active',
        limit: 1,
      });
      if (subs.data.length > 0) {
        subscriptionId = subs.data[0].id;
        await User.findByIdAndUpdate(dbUser._id, {
          stripeSubscriptionId: subscriptionId,
          subscriptionStatus: subs.data[0].status,
        });
      }
    }

    if (!subscriptionId) return res.json({ success: true, subscription: null });

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product', 'latest_invoice'],
    });

    const item = subscription.items.data[0];
    const price = item.price;

    return res.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        lookupKey: price.lookup_key,
        productName: price.product.name,
        amount: price.unit_amount,
        interval: price.recurring.interval,
        intervalCount: price.recurring.interval_count,
        latestInvoiceUrl: subscription.latest_invoice?.hosted_invoice_url,
        latestInvoicePdf: subscription.latest_invoice?.invoice_pdf,
      },
    });
  } catch (err) {
    console.error('getCurrentSubscription error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CANCEL + RESUME
// ═══════════════════════════════════════════════════════════════════════════

exports.cancelSubscription = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    const dbUser = await User.findById(req.user._id);
    if (!dbUser?.stripeSubscriptionId) {
      return res.status(404).json({ success: false, message: 'No active subscription' });
    }

    const { immediately = false } = req.body;
    const subscription = immediately
      ? await stripe.subscriptions.cancel(dbUser.stripeSubscriptionId)
      : await stripe.subscriptions.update(dbUser.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });

    await User.findByIdAndUpdate(dbUser._id, { subscriptionStatus: subscription.status });

    return res.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    });
  } catch (err) {
    console.error('cancelSubscription error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.resumeSubscription = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    const dbUser = await User.findById(req.user._id);
    if (!dbUser?.stripeSubscriptionId) {
      return res.status(404).json({ success: false, message: 'No subscription' });
    }

    const subscription = await stripe.subscriptions.update(dbUser.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    return res.json({
      success: true,
      subscription: { id: subscription.id, status: subscription.status },
    });
  } catch (err) {
    console.error('resumeSubscription error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK
// ═══════════════════════════════════════════════════════════════════════════

exports.webhookHandler = async (req, res) => {
  const sig = req.headers['stripe-signature'];

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔔 Webhook received');
  console.log('  Has signature header:', !!sig);
  console.log('  Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('  Webhook secret set:', !!process.env.STRIPE_WEBHOOK_SECRET);

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log('  ✓ Verified event:', event.type);
  } catch (err) {
    console.error('  ✗ Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        console.log(`  → checkout.session.completed for user ${userId}`);
        if (userId && session.subscription) {
          await User.findByIdAndUpdate(userId, {
            stripeSubscriptionId: session.subscription,
            stripeCustomerId: session.customer,
            subscriptionStatus: 'active',
            subscriptionLookupKey: session.metadata?.lookupKey,
            lastPaidAt: new Date(),
          });
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        console.log(`  → invoice.paid for customer ${invoice.customer}`);
        if (invoice.subscription) {
          const user = await User.findOne({ stripeCustomerId: invoice.customer });
          if (user) {
            await User.findByIdAndUpdate(user._id, {
              stripeSubscriptionId: invoice.subscription,
              subscriptionStatus: 'active',
              lastPaidAt: new Date(),
            });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user) {
          await User.findByIdAndUpdate(user._id, { subscriptionStatus: 'past_due' });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;
        console.log(`  → ${event.type} for user ${userId}, status: ${subscription.status}`);
        if (userId) {
          await User.findByIdAndUpdate(userId, {
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            subscriptionLookupKey: subscription.metadata?.lookupKey,
          });
        } else {
          const user = await User.findOne({ stripeCustomerId: subscription.customer });
          if (user) {
            await User.findByIdAndUpdate(user._id, {
              stripeSubscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
            });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const user = await User.findOne({ stripeCustomerId: subscription.customer });
        if (user) {
          await User.findByIdAndUpdate(user._id, {
            subscriptionStatus: 'canceled',
            stripeSubscriptionId: null,
            subscriptionLookupKey: null,
          });
        }
        break;
      }

      default:
        console.log(`  → Ignored event: ${event.type}`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).send('Webhook handler failed');
  }
};