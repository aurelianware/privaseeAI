// ─── JWT signature verification via Microsoft Entra ID JWKS ──────────────────
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { getPrisma } = require('./db');

const _jwksClient = jwksClient({
  jwksUri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
  cache: true,
  cacheMaxEntries: 10,
  cacheMaxAge: 10 * 60 * 60 * 1000, // 10 hours
  rateLimit: true,
});

function _getSigningKey(header, callback) {
  _jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

// DEAD CODE — synchronous path; never called. Keep to avoid accidental re-introduction.
// All callers use verifyEntraTokenAsync instead.
function extractEntraOid(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header) return null;
    let signingKey;
    try {
      const keyObj = _jwksClient.getSigningKeySync(decoded.header.kid);
      signingKey = keyObj.getPublicKey();
    } catch {
      return null;
    }
    const clientId = process.env.ENTRA_CLIENT_ID;
    const verifyOptions = {
      algorithms: ['RS256'],
      ...(clientId ? { audience: clientId } : {}),
    };
    const payload = jwt.verify(token, signingKey, verifyOptions);
    return { oid: payload.oid || payload.sub, email: payload.preferred_username || payload.email || null };
  } catch {
    return null;
  }
}

// Async version used by all route handlers and middleware.
async function verifyEntraTokenAsync(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  return new Promise((resolve) => {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header) return resolve(null);

    _getSigningKey(decoded.header, (err, signingKey) => {
      if (err) return resolve(null);
      try {
        const clientId = process.env.ENTRA_CLIENT_ID;
        const verifyOptions = {
          algorithms: ['RS256'],
          ...(clientId ? { audience: clientId } : {}),
        };
        const payload = jwt.verify(token, signingKey, verifyOptions);
        resolve({ oid: payload.oid || payload.sub, email: payload.preferred_username || payload.email || null });
      } catch {
        resolve(null);
      }
    });
  });
}

// requirePro middleware — gates cloud-only endpoints behind PRO/ENTERPRISE
async function requirePro(req, res, next) {
  const identity = await verifyEntraTokenAsync(req);
  if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });
  const db = getPrisma();
  if (!db) return next(); // no DB → allow (dev mode)
  try {
    const settings = await db.userSettings.findUnique({ where: { entraOid: identity.oid } });
    const tier = settings?.subscriptionTier || 'FREE';
    if (tier === 'FREE') {
      return res.status(403).json({
        error: 'PRO or ENTERPRISE subscription required',
        upgradeUrl: '/pricing',
        currentTier: 'FREE',
      });
    }
    next();
  } catch (err) {
    console.error('requirePro error:', err);
    return res.status(503).json({ error: 'Service temporarily unavailable — please retry' });
  }
}

// requireEnterprise middleware — gates SIEM/audit endpoints behind ENTERPRISE only
async function requireEnterprise(req, res, next) {
  const identity = await verifyEntraTokenAsync(req);
  if (!identity?.oid) return res.status(401).json({ error: 'Unauthorized' });
  const db = getPrisma();
  if (!db) return next(); // dev mode — allow
  try {
    const settings = await db.userSettings.findUnique({ where: { entraOid: identity.oid } });
    const tier = settings?.subscriptionTier || 'FREE';
    if (tier !== 'ENTERPRISE') {
      return res.status(403).json({
        error: 'ENTERPRISE subscription required for audit log export',
        upgradeUrl: '/pricing',
        currentTier: tier,
      });
    }
    next();
  } catch (err) {
    console.error('requireEnterprise error:', err);
    return res.status(503).json({ error: 'Service temporarily unavailable — please retry' });
  }
}

module.exports = { verifyEntraTokenAsync, requirePro, requireEnterprise, extractEntraOid };
