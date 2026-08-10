CREATE TABLE "BrandIdentityPendingChange" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expectedVersion" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "remoteVersion" INTEGER,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'HUMAN',
    "actorName" TEXT,
    "actorRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandIdentityPendingChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandIdentityPendingChange_brandId_field_key"
ON "BrandIdentityPendingChange"("brandId", "field");

CREATE INDEX "BrandIdentityPendingChange_status_nextAttemptAt_idx"
ON "BrandIdentityPendingChange"("status", "nextAttemptAt");

CREATE INDEX "BrandIdentityPendingChange_brandId_idx"
ON "BrandIdentityPendingChange"("brandId");

ALTER TABLE "BrandIdentityPendingChange"
ADD CONSTRAINT "BrandIdentityPendingChange_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
