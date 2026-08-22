-- Immedi Today ERP integration fields for SystemConfig
ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "immediErpApiKey" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "immediErpBaseUrl" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "immediErpEnabled" BOOLEAN DEFAULT false;
ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "immediErpItemCodeMap" JSONB;
