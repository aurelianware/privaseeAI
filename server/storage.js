// ─── Managed Azure Blob Storage helpers ───────────────────────────────────────
const { createHmac } = require('crypto');

/** Derive a valid Azure container name from an Entra OID GUID.
 *  Container names: 3–63 lowercase alphanumeric + hyphens, start/end with letter/number. */
function sanitizeOidForContainer(oid) {
  return ('user-' + oid.replace(/-/g, '')).slice(0, 63).toLowerCase();
}

/** Generate a short-lived, container-scoped SAS token signed with the storage account key.
 *  Returns the raw SAS query string (no leading '?'). */
function generateContainerSas(containerName, durationMinutes = 60) {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT;
  const accountKey  = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  if (!accountName || !accountKey) {
    throw new Error('AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCOUNT_KEY are required for managed storage');
  }

  const now    = new Date();
  const start  = new Date(now.getTime() - 60_000); // 1 min back for clock skew
  const expiry = new Date(now.getTime() + durationMinutes * 60_000);
  const fmt    = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const sv = '2022-11-02'; // signed service version
  const ss = 'b';          // blob service only
  const srt = 'co';        // container + object
  const sp = 'rwdlac';     // read, write, delete, list, add, create
  const se = fmt(expiry);
  const st = fmt(start);
  const spr = 'https';

  // String-to-sign for Account SAS (service version 2020-12-06+)
  // Exactly 10 components, each followed by \n (trailing \n required)
  // Ref: https://learn.microsoft.com/en-us/rest/api/storageservices/create-account-sas
  const stringToSign =
    accountName + '\n' +
    sp          + '\n' +  // signedPermissions
    ss          + '\n' +  // signedServices
    srt         + '\n' +  // signedResourceTypes
    st          + '\n' +  // signedStart
    se          + '\n' +  // signedExpiry
                  '\n' +  // signedIP (empty = any)
    spr         + '\n' +  // signedProtocol
    sv          + '\n' +  // signedVersion
                  '\n';   // signedEncryptionScope (empty)

  const keyBytes = Buffer.from(accountKey, 'base64');
  const sig = createHmac('sha256', keyBytes).update(stringToSign, 'utf8').digest('base64');

  return `sv=${sv}&ss=${ss}&srt=${srt}&sp=${encodeURIComponent(sp)}&st=${encodeURIComponent(st)}&se=${encodeURIComponent(se)}&spr=${spr}&sig=${encodeURIComponent(sig)}`;
}

/** Idempotently create an Azure Blob container for the user and mark DB.
 *  Uses a long-lived admin SAS stored in AZURE_ADMIN_SAS for container creation.
 *  @param {string} entraOid
 *  @param {import('@prisma/client').PrismaClient|null} db - passed by caller */
async function provisionUserContainer(entraOid, db) {
  const accountName  = process.env.AZURE_STORAGE_ACCOUNT;
  const adminSas     = process.env.AZURE_ADMIN_SAS;
  if (!accountName || !adminSas) {
    throw new Error('AZURE_STORAGE_ACCOUNT and AZURE_ADMIN_SAS are required for container provisioning');
  }

  const containerName = sanitizeOidForContainer(entraOid);
  const url = `https://${accountName}.blob.core.windows.net/${containerName}?restype=container&${adminSas}`;

  const res = await fetch(url, { method: 'PUT', headers: { 'x-ms-version': '2022-11-02' } });
  // 201 = created, 409 = already exists — both are success
  if (res.status !== 201 && res.status !== 409) {
    const body = await res.text();
    throw new Error(`Container provisioning failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }

  if (db) {
    await db.userSettings.update({
      where: { entraOid },
      data: { managedContainer: true },
    });
  }

  return containerName;
}

module.exports = { sanitizeOidForContainer, generateContainerSas, provisionUserContainer };
