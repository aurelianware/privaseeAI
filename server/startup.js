// ─── Startup env validation ───────────────────────────────────────────────────
// Warn clearly about missing config so prod log grep is easy.
function checkEnv() {
  const required = [
    { key: 'DATABASE_URL',               impact: 'User settings and subscription data will not persist' },
    { key: 'STRIPE_SECRET_KEY',          impact: 'Billing/checkout will be unavailable' },
    { key: 'STRIPE_WEBHOOK_SECRET',      impact: 'Stripe webhooks will be rejected (subscription updates broken)' },
    { key: 'STRIPE_PRO_PRICE_ID',        impact: 'PRO checkout sessions will fail' },
    { key: 'STRIPE_ENTERPRISE_PRICE_ID', impact: 'ENTERPRISE checkout sessions will fail' },
    { key: 'SETTINGS_ENCRYPTION_KEY',    impact: 'User settings will use a one-time key (lost on restart)' },
    { key: 'AZURE_STORAGE_ACCOUNT',      impact: 'Managed per-user storage will be unavailable (PRO/ENTERPRISE)' },
    { key: 'AZURE_STORAGE_ACCOUNT_KEY',  impact: 'Server-generated SAS tokens will fail (managed storage broken)' },
    { key: 'AZURE_ADMIN_SAS',            impact: 'Container provisioning will fail (new PRO/ENTERPRISE users get no storage)' },
    { key: 'DRONE_CONTROLLER_KEY',       impact: 'Android controller app cannot authenticate; RTMP streams will be unauthenticated' },
  ];
  const missing = required.filter(({ key }) => !process.env[key]);
  if (missing.length) {
    console.warn('\n⚠️  MISSING ENVIRONMENT VARIABLES:');
    missing.forEach(({ key, impact }) =>
      console.warn(`   • ${key.padEnd(30)} → ${impact}`)
    );
    console.warn('   Set these in .env.local (dev) or your container/ACA secrets (prod)\n');
  }
}

module.exports = { checkEnv };
