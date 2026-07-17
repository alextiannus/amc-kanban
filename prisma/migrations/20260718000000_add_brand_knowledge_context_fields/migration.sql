-- Add structured brand context fields to BrandKnowledge
ALTER TABLE "BrandKnowledge"
  ADD COLUMN IF NOT EXISTS "audienceAssumptions" TEXT,
  ADD COLUMN IF NOT EXISTS "productAssumptions"  TEXT,
  ADD COLUMN IF NOT EXISTS "growthSyncHash"      TEXT;
