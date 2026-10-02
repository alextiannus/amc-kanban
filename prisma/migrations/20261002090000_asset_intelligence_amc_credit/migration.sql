ALTER TABLE "MediaAsset"
  ADD COLUMN "folderId" TEXT,
  ADD COLUMN "assetKind" TEXT NOT NULL DEFAULT 'image',
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "perceptualHash" TEXT,
  ADD COLUMN "subjects" JSONB,
  ADD COLUMN "captureType" TEXT,
  ADD COLUMN "quality" JSONB,
  ADD COLUMN "textDetection" JSONB,
  ADD COLUMN "duplicateGroupId" TEXT,
  ADD COLUMN "linkHealth" JSONB,
  ADD COLUMN "analysisState" JSONB,
  ADD COLUMN "analysisVersion" TEXT,
  ADD COLUMN "searchText" TEXT,
  ADD COLUMN "visualEmbedding" JSONB,
  ADD COLUMN "manualOverrides" JSONB;

UPDATE "MediaAsset" SET "assetKind" = CASE WHEN "mimeType" LIKE 'video/%' THEN 'video' ELSE 'image' END;

CREATE INDEX "MediaAsset_brandId_duplicateGroupId_idx" ON "MediaAsset"("brandId", "duplicateGroupId");
CREATE INDEX "MediaAsset_brandId_analysisVersion_idx" ON "MediaAsset"("brandId", "analysisVersion");
CREATE INDEX "MediaAsset_folderId_idx" ON "MediaAsset"("folderId");
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "BrandFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BrandFolder" ADD COLUMN "parentId" TEXT;
CREATE INDEX "BrandFolder_parentId_idx" ON "BrandFolder"("parentId");
ALTER TABLE "BrandFolder" ADD CONSTRAINT "BrandFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "BrandFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AssetVideoSegment" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "segmentKey" TEXT NOT NULL,
  "startMs" INTEGER NOT NULL,
  "endMs" INTEGER NOT NULL,
  "subjects" JSONB,
  "scene" TEXT,
  "action" TEXT,
  "captureType" TEXT,
  "quality" JSONB,
  "textDetection" JSONB,
  "stabilityScore" DOUBLE PRECISION,
  "roleSuitability" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "searchText" TEXT,
  "visualEmbedding" JSONB,
  "analysisVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetVideoSegment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetVideoSegment_assetId_segmentKey_analysisVersion_key" ON "AssetVideoSegment"("assetId", "segmentKey", "analysisVersion");
CREATE INDEX "AssetVideoSegment_assetId_startMs_idx" ON "AssetVideoSegment"("assetId", "startMs");
ALTER TABLE "AssetVideoSegment" ADD CONSTRAINT "AssetVideoSegment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AmcCreditAccount" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "planId" TEXT NOT NULL DEFAULT 'starter',
  "cycleAllowance" INTEGER NOT NULL DEFAULT 1000,
  "allowOverage" BOOLEAN NOT NULL DEFAULT true,
  "allowNightlyOverage" BOOLEAN NOT NULL DEFAULT false,
  "cycleAnchor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentCycleStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentCycleEnd" TIMESTAMP(3),
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AmcCreditAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AmcCreditAccount_brandId_key" ON "AmcCreditAccount"("brandId");
ALTER TABLE "AmcCreditAccount" ADD CONSTRAINT "AmcCreditAccount_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AmcCreditCycle" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "includedCredit" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AmcCreditCycle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AmcCreditCycle_brandId_startsAt_key" ON "AmcCreditCycle"("brandId", "startsAt");
CREATE INDEX "AmcCreditCycle_accountId_endsAt_idx" ON "AmcCreditCycle"("accountId", "endsAt");
ALTER TABLE "AmcCreditCycle" ADD CONSTRAINT "AmcCreditCycle_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmcCreditCycle" ADD CONSTRAINT "AmcCreditCycle_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AmcCreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AmcCreditLedgerEntry" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "taskType" TEXT,
  "taskId" TEXT,
  "creditDelta" INTEGER NOT NULL,
  "rawUsage" JSONB,
  "internalCostMicros" BIGINT,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AmcCreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AmcCreditLedgerEntry_idempotencyKey_key" ON "AmcCreditLedgerEntry"("idempotencyKey");
CREATE INDEX "AmcCreditLedgerEntry_accountId_createdAt_idx" ON "AmcCreditLedgerEntry"("accountId", "createdAt");
CREATE INDEX "AmcCreditLedgerEntry_cycleId_kind_idx" ON "AmcCreditLedgerEntry"("cycleId", "kind");
CREATE INDEX "AmcCreditLedgerEntry_taskId_idx" ON "AmcCreditLedgerEntry"("taskId");
ALTER TABLE "AmcCreditLedgerEntry" ADD CONSTRAINT "AmcCreditLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AmcCreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmcCreditLedgerEntry" ADD CONSTRAINT "AmcCreditLedgerEntry_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AmcCreditCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
