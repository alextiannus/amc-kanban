-- Subscription belongs to AI Agent/account identity; brand link is optional.
ALTER TABLE "BrandSubscription"
  ALTER COLUMN "brandId" DROP NOT NULL;

ALTER TABLE "BrandSubscription"
  DROP CONSTRAINT IF EXISTS "BrandSubscription_brandId_fkey";

ALTER TABLE "BrandSubscription"
  ADD CONSTRAINT "BrandSubscription_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
