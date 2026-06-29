-- AlterTable: Add annotation fields to CompanionMessage
ALTER TABLE "CompanionMessage"
    ADD COLUMN "rating"           INTEGER,
    ADD COLUMN "adminNote"        TEXT,
    ADD COLUMN "correctedContent" TEXT,
    ADD COLUMN "isAnnotated"      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "trainingTag"      TEXT;

-- CreateIndex
CREATE INDEX "CompanionMessage_isAnnotated_idx" ON "CompanionMessage"("isAnnotated");
CREATE INDEX "CompanionMessage_trainingTag_idx" ON "CompanionMessage"("trainingTag");

-- CreateTable: CopywriterLog
CREATE TABLE "CopywriterLog" (
    "id"               TEXT NOT NULL,
    "brandId"          TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "promptVersion"    TEXT,
    "systemPrompt"     TEXT NOT NULL,
    "userInput"        TEXT NOT NULL,
    "rawOutput"        TEXT NOT NULL,
    "modelId"          TEXT,
    "latencyMs"        INTEGER,
    "tokenEstimate"    INTEGER,
    "platform"         TEXT,
    "draftId"          TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating"           INTEGER,
    "adminNote"        TEXT,
    "correctedContent" TEXT,
    "isAnnotated"      BOOLEAN NOT NULL DEFAULT false,
    "trainingTag"      TEXT,

    CONSTRAINT "CopywriterLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopywriterLog_brandId_idx"     ON "CopywriterLog"("brandId");
CREATE INDEX "CopywriterLog_createdAt_idx"   ON "CopywriterLog"("createdAt");
CREATE INDEX "CopywriterLog_isAnnotated_idx" ON "CopywriterLog"("isAnnotated");
CREATE INDEX "CopywriterLog_trainingTag_idx" ON "CopywriterLog"("trainingTag");

-- AddForeignKey
ALTER TABLE "CopywriterLog" ADD CONSTRAINT "CopywriterLog_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
