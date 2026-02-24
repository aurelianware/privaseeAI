// Stripe client — lazy init
let stripeClient = null;

function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) { console.warn('⚠️  STRIPE_SECRET_KEY not set'); return null; }
    try {
      const Stripe = require('stripe');
      stripeClient = new Stripe(key, { apiVersion: '2026-01-28.clover' });
    } catch (e) {
      console.warn('⚠️  Stripe unavailable:', e.message);
    }
  }
  return stripeClient;
}

module.exports = { getStripe };
