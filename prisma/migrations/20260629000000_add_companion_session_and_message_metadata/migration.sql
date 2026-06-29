-- CreateTable
CREATE TABLE "CompanionSession" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompanionSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanionSession_brandId_userId_idx" ON "CompanionSession"("brandId", "userId");

-- CreateIndex
CREATE INDEX "CompanionSession_startedAt_idx" ON "CompanionSession"("startedAt");

-- AddForeignKey
ALTER TABLE "CompanionSession" ADD CONSTRAINT "CompanionSession_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add metadata columns to CompanionMessage
ALTER TABLE "CompanionMessage"
    ADD COLUMN "sessionId" TEXT,
    ADD COLUMN "inputType" TEXT,
    ADD COLUMN "modelId" TEXT,
    ADD COLUMN "latencyMs" INTEGER,
    ADD COLUMN "tokenEstimate" INTEGER,
    ADD COLUMN "intentDetected" TEXT;

-- CreateIndex
CREATE INDEX "CompanionMessage_sessionId_idx" ON "CompanionMessage"("sessionId");

-- AddForeignKey
ALTER TABLE "CompanionMessage" ADD CONSTRAINT "CompanionMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CompanionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
