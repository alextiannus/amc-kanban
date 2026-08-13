ALTER TABLE "Brand"
ADD COLUMN IF NOT EXISTS "industry" TEXT,
ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

CREATE TABLE "BrandGrowthSyncState" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "mode" TEXT NOT NULL DEFAULT 'INCREMENTAL',
    "dirtyPaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "forcePaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "conflicts" JSONB,
    "lastPayloadHash" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "actorName" TEXT,
    "actorRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandGrowthSyncState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandGrowthSyncState_brandId_key"
ON "BrandGrowthSyncState"("brandId");

CREATE INDEX "BrandGrowthSyncState_status_nextAttemptAt_idx"
ON "BrandGrowthSyncState"("status", "nextAttemptAt");

CREATE INDEX "BrandGrowthSyncState_brandId_idx"
ON "BrandGrowthSyncState"("brandId");

ALTER TABLE "BrandGrowthSyncState"
ADD CONSTRAINT "BrandGrowthSyncState_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "BrandGrowthSyncState" (
  "id", "brandId", "status", "mode", "dirtyPaths", "nextAttemptAt", "createdAt", "updatedAt"
)
SELECT
  'growthsync_' || md5(b."id"), b."id", 'PENDING', 'BACKFILL', ARRAY['*']::TEXT[],
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Brand" b
WHERE b."status" <> 'ARCHIVED'
ON CONFLICT ("brandId") DO NOTHING;
