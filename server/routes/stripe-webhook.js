// ─── Stripe webhook — MUST be registered before express.json() ───────────────
// Stripe requires the raw request body to verify the signature.
// IMPORTANT: Call createStripeWebhookRoutes(app) before registerMiddleware(app).
const express = require('express');
const { getPrisma }              = require('../db');
const { getStripe }              = require('../stripe-client');
const { provisionUserContainer } = require('../storage');

function createStripeWebhookRoutes(app) {
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Stripe unavailable' });

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('⚠️  STRIPE_WEBHOOK_SECRET not set — rejecting webhook');
      return res.status(400).send('Webhook secret not configured');
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Stripe webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const db = getPrisma();
    if (!db) return res.json({ received: true }); // no DB — ack and skip

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const entraOid = session.metadata?.entraOid;
          if (entraOid && session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            const priceId = subscription.items.data[0]?.price?.id;
            const tier = priceId === process.env.STRIPE_PRO_PRICE_ID ? 'PRO'
                       : priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID ? 'ENTERPRISE'
                       : 'FREE';
            await db.userSettings.upsert({
              where: { entraOid },
              create: {
                entraOid,
                subscriptionTier: tier,
                stripeCustomerId: session.customer,
                stripeSubscriptionId: session.subscription,
                subscriptionStatus: 'active',
                subscriptionCurrentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
              },
              update: {
                subscriptionTier: tier,
                stripeCustomerId: session.customer,
                stripeSubscriptionId: session.subscription,
                subscriptionStatus: 'active',
                subscriptionCurrentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
              },
            });
            console.log(`✅ Subscription activated for OID ${entraOid} → ${tier}`);
            if (['PRO', 'ENTERPRISE'].includes(tier)) {
              provisionUserContainer(entraOid, db).catch(err =>
                console.error('[STORAGE] Container provision failed in webhook:', err.message)
              );
            }
          }
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object;
          const priceId = subscription.items.data[0]?.price?.id;
          const tier = priceId === process.env.STRIPE_PRO_PRICE_ID ? 'PRO'
                     : priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID ? 'ENTERPRISE'
                     : 'FREE';
          await db.userSettings.updateMany({
            where: { stripeSubscriptionId: subscription.id },
            data: {
              subscriptionTier: tier,
              subscriptionStatus: subscription.status,
              subscriptionCurrentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
            },
          });
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          await db.userSettings.updateMany({
            where: { stripeSubscriptionId: subscription.id },
            data: {
              subscriptionTier: 'FREE',
              subscriptionStatus: 'canceled',
              stripeSubscriptionId: null,
            },
          });
          break;
        }

        default:
          // Unhandled event type — ack anyway
          break;
      }
      res.json({ received: true });
    } catch (err) {
      console.error('Stripe webhook processing error:', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
}

module.exports = { createStripeWebhookRoutes };
