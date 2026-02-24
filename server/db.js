// Prisma client — lazy init so server starts even without DB
// Prisma 7 requires a driver adapter (dropped traditional library engine).
// Using @prisma/adapter-pg with the pg Pool for PostgreSQL connections.
let prisma = null;

function getPrisma() {
  if (!prisma) {
    try {
      const { PrismaClient } = require('@prisma/client');
      const { Pool } = require('pg');
      const { PrismaPg } = require('@prisma/adapter-pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const adapter = new PrismaPg(pool);
      prisma = new PrismaClient({ adapter });
    } catch (e) {
      console.warn('⚠️  Prisma unavailable (no DB?):', e.message);
    }
  }
  return prisma;
}

module.exports = { getPrisma };
