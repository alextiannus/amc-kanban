-- Add brand-level Google OAuth app credentials per merchant/brand
ALTER TABLE "Brand"
  ADD COLUMN IF NOT EXISTS "googleClientId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleClientSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "googleRedirectUri" TEXT;
