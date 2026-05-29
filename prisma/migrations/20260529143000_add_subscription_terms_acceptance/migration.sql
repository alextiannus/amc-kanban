-- AlterTable
ALTER TABLE "BrandSubscription"
ADD COLUMN IF NOT EXISTS "termsVersion" TEXT,
ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);