// ─── AES-256-GCM helpers ───────────────────────────────────────────────────────
// Key must be 32 bytes hex in SETTINGS_ENCRYPTION_KEY env var.
// Automatically generated and printed once if missing.
const { createCipheriv, createDecipheriv, randomBytes } = require('crypto');

function getEncryptionKey() {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw || Buffer.from(raw, 'hex').length !== 32) {
    const generated = randomBytes(32).toString('hex');
    console.warn('⚠️  SETTINGS_ENCRYPTION_KEY missing or invalid. Add this to .env.local:\n' +
      `SETTINGS_ENCRYPTION_KEY=${generated}`);
    // Use the generated key for this session (not persistent — set it properly!)
    process.env.SETTINGS_ENCRYPTION_KEY = generated;
    return Buffer.from(generated, 'hex');
  }
  return Buffer.from(raw, 'hex');
}

function encryptValue(plaintext) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptValue(stored) {
  const [ivHex, tagHex, encHex] = stored.split(':');
  const key = getEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}

module.exports = { getEncryptionKey, encryptValue, decryptValue };
