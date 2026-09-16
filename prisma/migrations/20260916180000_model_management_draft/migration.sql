CREATE TABLE "ModelManagementDraft" (
  id TEXT PRIMARY KEY DEFAULT 'default',
  revision INTEGER NOT NULL DEFAULT 0,
  "baseVersion" INTEGER,
  configuration JSONB NOT NULL,
  "initializationReport" JSONB,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT NOT NULL
);
