CREATE TABLE "ModelDelegatedJob" (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  task TEXT NOT NULL,
  platform TEXT,
  version INTEGER NOT NULL,
  "inputHash" TEXT NOT NULL,
  "contentJobId" TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "ModelExecutionLog" ADD COLUMN executor TEXT;
