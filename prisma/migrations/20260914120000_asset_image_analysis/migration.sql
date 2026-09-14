ALTER TABLE "Brand" ADD COLUMN "assetFoldersInitialized" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaAsset" ADD COLUMN "imageAnalysis" JSONB;
ALTER TABLE "SystemConfig" ADD COLUMN "assetAnalysisEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "assetAnalysisGatewayUrl" TEXT, ADD COLUMN "assetAnalysisGatewaySecret" TEXT;
CREATE TABLE "AssetAnalysisBatch" (
 "id" TEXT PRIMARY KEY, "brandId" TEXT NOT NULL REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "batchKey" TEXT NOT NULL, "language" TEXT NOT NULL DEFAULT 'zh', "industry" TEXT NOT NULL, "context" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUEUED', "sealed" BOOLEAN NOT NULL DEFAULT true,
 "summaryJobId" TEXT, "summaryRequest" JSONB, "groups" JSONB, "error" TEXT, "leaseUntil" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "AssetAnalysisBatch_brandId_batchKey_key" ON "AssetAnalysisBatch"("brandId", "batchKey");
CREATE INDEX "AssetAnalysisBatch_status_leaseUntil_idx" ON "AssetAnalysisBatch"("status", "leaseUntil");
CREATE TABLE "AssetAnalysisItem" (
 "id" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL REFERENCES "AssetAnalysisBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "assetId" TEXT NOT NULL REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "status" TEXT NOT NULL DEFAULT 'QUEUED', "attempt" INTEGER NOT NULL DEFAULT 0, "gatewayJobId" TEXT, "gatewayRequest" JSONB,
 "result" JSONB, "originalCategory" TEXT, "originalUpdatedAt" TIMESTAMP(3) NOT NULL, "error" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "AssetAnalysisItem_batchId_assetId_key" ON "AssetAnalysisItem"("batchId", "assetId");
CREATE INDEX "AssetAnalysisItem_assetId_status_idx" ON "AssetAnalysisItem"("assetId", "status");
