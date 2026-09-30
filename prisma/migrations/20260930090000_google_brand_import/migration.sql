CREATE TABLE "GoogleBrandImport" (
 "brandId" TEXT PRIMARY KEY REFERENCES "Brand"("id") ON DELETE CASCADE,
 "socialAccountId" TEXT,
 "configHash" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "generation" INTEGER NOT NULL DEFAULT 1,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseUntil" TIMESTAMP(3),
 "lastError" TEXT,
 "result" JSONB,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GoogleBrandImport_status_nextAttemptAt_idx" ON "GoogleBrandImport"("status", "nextAttemptAt");
