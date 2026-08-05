ALTER TABLE "BrandSubscription"
  ADD COLUMN IF NOT EXISTS "trialStartsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "billingStartsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "feeWaived" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "PostfastApiKeyPool" (
  "id" TEXT NOT NULL,
  "label" TEXT,
  "token" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "prefix" TEXT,
  "last4" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "assignedBrandId" TEXT,
  "assignedUserId" TEXT,
  "assignedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostfastApiKeyPool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PostfastApiKeyPool_tokenHash_key"
  ON "PostfastApiKeyPool"("tokenHash");

CREATE UNIQUE INDEX IF NOT EXISTS "PostfastApiKeyPool_assignedBrandId_key"
  ON "PostfastApiKeyPool"("assignedBrandId")
  WHERE "assignedBrandId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "PostfastApiKeyPool_status_idx"
  ON "PostfastApiKeyPool"("status");

CREATE INDEX IF NOT EXISTS "PostfastApiKeyPool_assignedBrandId_idx"
  ON "PostfastApiKeyPool"("assignedBrandId");

CREATE INDEX IF NOT EXISTS "PostfastApiKeyPool_assignedUserId_idx"
  ON "PostfastApiKeyPool"("assignedUserId");
