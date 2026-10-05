ALTER TABLE "SalesLead"
  ADD COLUMN "erpLeadName" TEXT,
  ADD COLUMN "erpSyncStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "erpSyncError" TEXT,
  ADD COLUMN "erpSyncAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "erpLastSyncAt" TIMESTAMP(3),
  ADD COLUMN "erpSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "SalesLead_erpLeadName_key" ON "SalesLead"("erpLeadName");
CREATE INDEX "SalesLead_erpSyncStatus_idx" ON "SalesLead"("erpSyncStatus");
