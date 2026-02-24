// Daily-rotating JSONL event log + Prisma SystemLog persistence
const path = require('path');
const fs = require('fs');
const { getPrisma } = require('./db');

const fsp = fs.promises;
// One level up from server/ to reach project root logs/
const eventLogDir = path.join(__dirname, '..', 'logs');

async function logEventToDb(entry) {
  const record = { ...entry, at: entry.at || new Date().toISOString() };

  // Always log to console for observability
  console.log('[EVENT]', JSON.stringify(record));

  // Non-blocking file persistence — append to logs/events-YYYY-MM-DD.jsonl
  const date = new Date().toISOString().slice(0, 10);
  const logFile = path.join(eventLogDir, `events-${date}.jsonl`);
  fsp.mkdir(eventLogDir, { recursive: true })
    .then(() => fsp.appendFile(logFile, JSON.stringify(record) + '\n'))
    .catch(err => console.error('[EVENT] Failed to write event log:', err.message));

  // Non-blocking DB persistence to SystemLog (queryable alternative to JSONL)
  const db = getPrisma();
  if (db) {
    const { type, message, correlationId, ...rest } = record;
    db.systemLog.create({
      data: {
        type: type || 'unknown',
        message: message ?? null,
        correlationId: correlationId ?? null,
        data: Object.keys(rest).length ? JSON.stringify(rest) : null,
      },
    }).catch(err => console.error('[EVENT] Failed to persist to SystemLog:', err.message));
  }
}

module.exports = { logEventToDb, eventLogDir };
