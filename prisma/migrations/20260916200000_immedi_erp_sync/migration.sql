ALTER TABLE "SystemConfig" ADD COLUMN "immediErpEmployeeMap" JSONB, ADD COLUMN "immediErpCostCenter" TEXT;
CREATE TABLE "ImmediErpSync" (
 "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
 "payloadHash" TEXT, "revision" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "reference" TEXT, "lastError" TEXT, "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ImmediErpSync_kind_sourceId_key" ON "ImmediErpSync"("kind", "sourceId");
CREATE INDEX "ImmediErpSync_status_nextAttemptAt_idx" ON "ImmediErpSync"("status", "nextAttemptAt");
INSERT INTO "ImmediErpSync" ("id", "kind", "sourceId", "status") VALUES ('rollout', 'CONTROL', 'rollout', 'SYNCED');
