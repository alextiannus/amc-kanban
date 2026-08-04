ALTER TABLE "ContentDraft"
  ADD COLUMN "viralCopyExperimentId" TEXT,
  ADD COLUMN "viralCopyExperimentAssignmentId" TEXT,
  ADD COLUMN "viralCopyExperimentArm" TEXT,
  ADD COLUMN "viralCopyExperimentOverridden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "viralCopyExperimentExcluded" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ContentDraft_viralCopyExperimentAssignmentId_idx"
  ON "ContentDraft"("viralCopyExperimentAssignmentId");
