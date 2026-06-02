-- Subscription belongs to AI Agent/account; remove direct Brand foreign key.
DROP INDEX IF EXISTS "BrandSubscription_brandId_status_idx";

ALTER TABLE "BrandSubscription"
  DROP CONSTRAINT IF EXISTS "BrandSubscription_brandId_fkey";

ALTER TABLE "BrandSubscription"
  DROP COLUMN IF EXISTS "brandId";

CREATE INDEX IF NOT EXISTS "BrandSubscription_status_idx"
  ON "BrandSubscription"("status");
