-- Explicit date-window rounds keep the permanent QR stable while controlling
-- when platform-entry rewards and spins are available.
CREATE TABLE "GameActivityRound" (
    "id" TEXT NOT NULL,
    "gameConfigId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameActivityRound_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GameActivityRound_valid_window" CHECK ("startsAt" < "endsAt")
);

CREATE TABLE "GameEntryReward" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameEntryReward_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GameEntryReward_valid_platform" CHECK ("platform" IN ('GOOGLE', 'XIAOHONGSHU', 'INSTAGRAM')),
    CONSTRAINT "GameEntryReward_positive_points" CHECK ("pointsAwarded" > 0)
);

CREATE INDEX "GameActivityRound_gameConfigId_startsAt_endsAt_idx"
ON "GameActivityRound"("gameConfigId", "startsAt", "endsAt");

CREATE UNIQUE INDEX "GameEntryReward_roundId_sessionId_key"
ON "GameEntryReward"("roundId", "sessionId");

CREATE INDEX "GameEntryReward_sessionId_createdAt_idx"
ON "GameEntryReward"("sessionId", "createdAt");

ALTER TABLE "GameActivityRound"
ADD CONSTRAINT "GameActivityRound_gameConfigId_fkey"
FOREIGN KEY ("gameConfigId") REFERENCES "GameConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameEntryReward"
ADD CONSTRAINT "GameEntryReward_roundId_fkey"
FOREIGN KEY ("roundId") REFERENCES "GameActivityRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameEntryReward"
ADD CONSTRAINT "GameEntryReward_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameConfig"
ALTER COLUMN "posterDesc" SET DEFAULT 'Open any sharing platform once per activity round to receive 5 points.';

-- Super Rola intentionally remains paused because this migration creates no
-- activity round. Only replace its obsolete incentive/screenshot instructions.
UPDATE "GameConfig"
SET
  "description" = '本轮首次打开任一分享平台可获得 5 积分。系统不验证是否公开发布；每次抽奖消耗 5 积分。',
  "posterDesc" = 'Open any sharing platform once per activity round to receive 5 points.'
WHERE "brandId" = 'cmr8o494f006trg2af6m9qb34';
