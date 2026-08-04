ALTER TABLE "ContentDraft"
  ADD COLUMN "viralCopyScriptId" TEXT,
  ADD COLUMN "viralCopyScriptVersionId" TEXT,
  ADD COLUMN "viralCopyScriptName" TEXT,
  ADD COLUMN "viralCopyScriptSelection" TEXT,
  ADD COLUMN "viralCopyScriptProvenance" JSONB;

CREATE INDEX "ContentDraft_viralCopyScriptId_idx" ON "ContentDraft"("viralCopyScriptId");
