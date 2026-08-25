CREATE TABLE "PostfastDeliveryJob" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "submissionKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "payload" JSONB NOT NULL,
  "mediaState" JSONB,
  "warnings" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "postfastPostId" TEXT,
  "postUrl" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PostfastDeliveryJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PostfastDeliveryJob_submissionKey_key"
ON "PostfastDeliveryJob"("submissionKey");

CREATE INDEX "PostfastDeliveryJob_status_nextAttemptAt_idx"
ON "PostfastDeliveryJob"("status", "nextAttemptAt");

CREATE INDEX "PostfastDeliveryJob_draftId_createdAt_idx"
ON "PostfastDeliveryJob"("draftId", "createdAt");

CREATE INDEX "PostfastDeliveryJob_brandId_status_idx"
ON "PostfastDeliveryJob"("brandId", "status");

ALTER TABLE "PostfastDeliveryJob"
ADD CONSTRAINT "PostfastDeliveryJob_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PostfastDeliveryJob"
ADD CONSTRAINT "PostfastDeliveryJob_draftId_fkey"
FOREIGN KEY ("draftId") REFERENCES "ContentDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
