// ─── Stripe billing endpoints ─────────────────────────────────────────────────
const { verifyEntraTokenAsync } = require('../auth');
const { getPrisma }             = require('../db');
const { getStripe }             = require('../stripe-client');

function createBillingRoutes(app) {
  // POST /api/stripe/create-checkout-session
  // Body: { planType: 'PRO' | 'ENTERPRISE' | 'FREE' }
  // Returns: { checkoutUrl: string | null }
  app.post('/api/stripe/create-checkout-session', async (req, res) => {
    const identity = await verifyEntraTokenAsync(req);
    if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });

    const { planType } = req.body;
    const db = getPrisma();

    // FREE plan — activate immediately, no Stripe
    if (!planType || planType === 'FREE') {
      if (db) {
        await db.userSettings.upsert({
          where: { entraOid: identity.oid },
          create: { entraOid: identity.oid, email: identity.email, subscriptionTier: 'FREE', subscriptionStatus: 'active' },
          update: { subscriptionTier: 'FREE', subscriptionStatus: 'active', stripeSubscriptionId: null },
        });
      }
      return res.json({ checkoutUrl: null });
    }

    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ message: 'Stripe unavailable — check STRIPE_SECRET_KEY' });

    const priceId = planType === 'PRO'
      ? process.env.STRIPE_PRO_PRICE_ID
      : planType === 'ENTERPRISE'
      ? process.env.STRIPE_ENTERPRISE_PRICE_ID
      : null;

    if (!priceId) return res.status(400).json({ message: `Invalid plan type: ${planType}` });

    const baseUrl = process.env.APP_URL || `https://${req.get('host')}`;

    let customerId;
    if (db) {
      try {
        const settings = await db.userSettings.findUnique({ where: { entraOid: identity.oid } });
        customerId = settings?.stripeCustomerId;
      } catch (dbErr) {
        console.warn('DB lookup failed during checkout (proceeding without customer ID):', dbErr.message);
      }
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/?session_id={CHECKOUT_SESSION_ID}&subscription=success`,
        cancel_url: `${baseUrl}/?subscription=canceled`,
        metadata: { entraOid: identity.oid },
        ...(identity.email && !customerId && { customer_email: identity.email }),
        ...(customerId && { customer: customerId }),
      });

      res.json({ checkoutUrl: session.url });
    } catch (err) {
      console.error('Stripe checkout error:', err);
      res.status(500).json({ message: 'Failed to create checkout session' });
    }
  });

  // GET /api/stripe/subscription-status
  // Returns: { tier: string, status: string, currentPeriodEnd: string | null }
  app.get('/api/stripe/subscription-status', async (req, res) => {
    const identity = await verifyEntraTokenAsync(req);
    if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });

    const db = getPrisma();
    if (!db) return res.json({ tier: 'FREE', status: 'active', currentPeriodEnd: null });

    try {
      const settings = await db.userSettings.findUnique({ where: { entraOid: identity.oid } });
      res.json({
        tier: settings?.subscriptionTier || 'FREE',
        status: settings?.subscriptionStatus || 'active',
        currentPeriodEnd: settings?.subscriptionCurrentPeriodEnd ?? null,
      });
    } catch (err) {
      console.error('Subscription status error:', err);
      res.status(500).json({ error: 'Failed to fetch subscription status' });
    }
  });
}

module.exports = { createBillingRoutes };
