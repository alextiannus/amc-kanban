CREATE TABLE "VoiceTask" (
 "id" TEXT PRIMARY KEY, "brandId" TEXT NOT NULL, "kind" TEXT NOT NULL, "requestKey" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'queued', "payload" JSONB NOT NULL, "result" JSONB, "error" TEXT,
 "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "VoiceTask_brandId_kind_requestKey_key" ON "VoiceTask"("brandId","kind","requestKey");
CREATE INDEX "VoiceTask_status_leaseUntil_idx" ON "VoiceTask"("status","leaseUntil");

ALTER TABLE "VideoProductionJob" ADD COLUMN "voiceoverState" JSONB;
