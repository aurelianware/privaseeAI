-- Migration: add UserSettings table for multi-tenant per-user credential storage
-- Run with: psql $DATABASE_URL -f prisma/migrations/add_user_settings.sql

CREATE TABLE IF NOT EXISTS "UserSettings" (
  "id"                    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "entraOid"              TEXT NOT NULL,
  "email"                 TEXT,
  "azureAccountName"      TEXT,
  "azureContainerName"    TEXT,
  "encryptedSasToken"     TEXT,
  "confidenceThreshold"   DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "humanDetection"        BOOLEAN NOT NULL DEFAULT true,
  "motionDetection"       BOOLEAN NOT NULL DEFAULT true,
  "notifications"         BOOLEAN NOT NULL DEFAULT true,
  "cloudSync"             BOOLEAN NOT NULL DEFAULT false,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserSettings_entraOid_key" ON "UserSettings"("entraOid");

-- Auto-update updatedAt
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW."updatedAt" = now(); RETURN NEW; END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS "UserSettings_updatedAt" ON "UserSettings";
CREATE TRIGGER "UserSettings_updatedAt"
  BEFORE UPDATE ON "UserSettings"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
