import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

// Initialize Stripe with secret key
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-11-17.clover', // Use latest stable API version
});

// Subscription plan configuration
export const SUBSCRIPTION_PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    priceId: null, // No Stripe price ID for free tier
    features: [
      'Up to 2 devices',
      'Basic AI detection',
      '24-hour event history',
      'Local storage only',
      'Community support'
    ],
    limits: {
      devices: 2,
      eventHistory: 24, // hours
      storage: '100MB',
      cloudSync: false,
      multiUser: false
    }
  },
  PRO: {
    name: 'Pro',
    price: 9.99,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    features: [
      'Up to 10 devices',
      'Advanced AI detection',
      '30-day event history',
      'Cloud sync & backup',
      'Email notifications',
      'Priority support'
    ],
    limits: {
      devices: 10,
      eventHistory: 720, // hours (30 days)
      storage: '1GB',
      cloudSync: true,
      multiUser: false
    }
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: 29.99,
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    features: [
      'Unlimited devices',
      'Premium AI detection',
      'Unlimited event history',
      'Advanced cloud features',
      'Team collaboration',
      'Custom integrations',
      'Dedicated support'
    ],
    limits: {
      devices: Infinity,
      eventHistory: Infinity,
      storage: '10GB',
      cloudSync: true,
      multiUser: true
    }
  }
} as const;

// Helper function to get plan by price ID
export function getPlanByPriceId(priceId: string) {
  return Object.values(SUBSCRIPTION_PLANS).find(plan => plan.priceId === priceId);
}

// Helper function to check if user has feature access
export function hasFeatureAccess(userPlan: keyof typeof SUBSCRIPTION_PLANS, feature: string): boolean {
  // eslint-disable-next-line security/detect-object-injection
  const plan = SUBSCRIPTION_PLANS[userPlan];
  return plan.features.some(f => f.toLowerCase().includes(feature.toLowerCase()));
}

// Helper function to check if user is within limits
export function isWithinLimits(userPlan: keyof typeof SUBSCRIPTION_PLANS, usage: {
  devices?: number;
  eventAge?: number; // hours
  storage?: string;
}): boolean {
  // eslint-disable-next-line security/detect-object-injection
  const plan = SUBSCRIPTION_PLANS[userPlan];
  
  if (usage.devices && usage.devices > plan.limits.devices) {
    return false;
  }
  
  if (usage.eventAge && usage.eventAge > plan.limits.eventHistory) {
    return false;
  }
  
  // Add more limit checks as needed
  return true;
}

export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PLANS;