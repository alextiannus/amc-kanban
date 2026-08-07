CREATE TABLE "GameShareDraftPoolItem" (
  "id" TEXT NOT NULL,
  "gameConfigId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "drafts" JSONB NOT NULL,
  "configFingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "reservedSessionId" TEXT,
  "reservedRoundId" TEXT,
  "reservedUntil" TIMESTAMP(3),
  "usedPlatform" TEXT,
  "usedAt" TIMESTAMP(3),
  "generationSource" TEXT NOT NULL DEFAULT 'ai',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameShareDraftPoolItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameShareDraftPoolState" (
  "id" TEXT NOT NULL,
  "gameConfigId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "configFingerprint" TEXT NOT NULL,
  "targetSize" INTEGER NOT NULL DEFAULT 5,
  "availableCount" INTEGER NOT NULL DEFAULT 0,
  "reservedCount" INTEGER NOT NULL DEFAULT 0,
  "generationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "taskLeaseUntil" TIMESTAMP(3),
  "lastGeneratedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameShareDraftPoolState_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GameShareDraftPoolItem_gameConfigId_locale_configFingerprint_status_idx"
ON "GameShareDraftPoolItem"("gameConfigId", "locale", "configFingerprint", "status");

CREATE INDEX "GameShareDraftPoolItem_reservedSessionId_reservedRoundId_status_idx"
ON "GameShareDraftPoolItem"("reservedSessionId", "reservedRoundId", "status");

CREATE INDEX "GameShareDraftPoolItem_reservedUntil_status_idx"
ON "GameShareDraftPoolItem"("reservedUntil", "status");

CREATE UNIQUE INDEX "GameShareDraftPoolState_gameConfigId_locale_key"
ON "GameShareDraftPoolState"("gameConfigId", "locale");

CREATE INDEX "GameShareDraftPoolState_generationStatus_taskLeaseUntil_idx"
ON "GameShareDraftPoolState"("generationStatus", "taskLeaseUntil");

ALTER TABLE "GameShareDraftPoolItem"
ADD CONSTRAINT "GameShareDraftPoolItem_gameConfigId_fkey"
FOREIGN KEY ("gameConfigId") REFERENCES "GameConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameShareDraftPoolState"
ADD CONSTRAINT "GameShareDraftPoolState_gameConfigId_fkey"
FOREIGN KEY ("gameConfigId") REFERENCES "GameConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
