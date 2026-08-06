-- Separate clerk-confirmed visit feedback from optional public sharing drafts.
ALTER TABLE "CustomerTaskSubmission"
ADD COLUMN "experienceTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "experienceNote" TEXT,
ADD COLUMN "rewardDate" TEXT;

-- Normalize one historical review task per session/business day. If old clients
-- created duplicates, keep the highest-value row as the eligible audit record
-- and leave the extras nullable so they can never satisfy the new reward key.
WITH ranked_review_tasks AS (
  SELECT
    submission."id",
    TO_CHAR(
      submission."createdAt" AT TIME ZONE COALESCE(NULLIF(brand."timezone", ''), 'Asia/Singapore'),
      'YYYY-MM-DD'
    ) AS "businessDate",
    ROW_NUMBER() OVER (
      PARTITION BY submission."sessionId", TO_CHAR(
        submission."createdAt" AT TIME ZONE COALESCE(NULLIF(brand."timezone", ''), 'Asia/Singapore'),
        'YYYY-MM-DD'
      )
      ORDER BY
        CASE WHEN submission."status" = 'APPROVED' THEN 0 ELSE 1 END,
        submission."pointsAwarded" DESC,
        submission."createdAt" ASC
    ) AS "rowNumber"
  FROM "CustomerTaskSubmission" submission
  INNER JOIN "Brand" brand ON brand."id" = submission."brandId"
  WHERE submission."taskType" = 'REVIEW_SUBMIT'
)
UPDATE "CustomerTaskSubmission" submission
SET
  "taskType" = 'EXPERIENCE_FEEDBACK',
  "rewardDate" = ranked."businessDate"
FROM ranked_review_tasks ranked
WHERE submission."id" = ranked."id" AND ranked."rowNumber" = 1;

CREATE UNIQUE INDEX "CustomerTaskSubmission_sessionId_taskType_rewardDate_key"
ON "CustomerTaskSubmission"("sessionId", "taskType", "rewardDate");

CREATE INDEX "CustomerTaskSubmission_brandId_rewardDate_idx"
ON "CustomerTaskSubmission"("brandId", "rewardDate");

CREATE TABLE "GameShareDraft" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "activityDate" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "experienceTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "experienceNote" TEXT,
  "drafts" JSONB,
  "generationSource" TEXT NOT NULL DEFAULT 'fallback',
  "generationCount" INTEGER NOT NULL DEFAULT 0,
  "aiCallCount" INTEGER NOT NULL DEFAULT 0,
  "ipHash" TEXT,
  "lastLimitReason" TEXT,
  "generatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameShareDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameShareDraft_sessionId_activityDate_key"
ON "GameShareDraft"("sessionId", "activityDate");

CREATE INDEX "GameShareDraft_brandId_activityDate_idx"
ON "GameShareDraft"("brandId", "activityDate");

CREATE INDEX "GameShareDraft_ipHash_activityDate_idx"
ON "GameShareDraft"("ipHash", "activityDate");

ALTER TABLE "GameShareDraft"
ADD CONSTRAINT "GameShareDraft_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameShareDraft"
ADD CONSTRAINT "GameShareDraft_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only rewrite exact system defaults; merchant-authored poster copy is preserved.
UPDATE "GameConfig"
SET "posterDesc" = 'Share your visit feedback to earn points. Public posting is optional.'
WHERE "posterDesc" IN (
  'Leave a review to spin and win rewards instantly!',
  'Leave a review or share store photos to get free drinks and rewards!'
);
