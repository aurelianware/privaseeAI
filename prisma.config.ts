import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma doesn't auto-load .env.local — do it manually so the URL is available
// during migrations/db push in local development.
// In production (Azure Container Apps) DATABASE_URL is injected as an env var.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { config } = require('dotenv');
  config({ path: path.resolve(__dirname, '.env.local') });
  config({ path: path.resolve(__dirname, '.env') });
} catch {
  // dotenv optional — not needed in production
}

// Prisma 7: connection URL lives here, not in schema.prisma datasource block.
export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL as string,
  },
});
