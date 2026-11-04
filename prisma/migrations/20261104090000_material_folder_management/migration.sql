-- Additive only. Historical classification is a separate, preview-first operation.
ALTER TABLE "Brand" ADD COLUMN "processedFoldersInitialized" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BrandFolder" ADD COLUMN "materialClass" TEXT NOT NULL DEFAULT 'UNCONFIRMED';
ALTER TABLE "BrandFolder" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MediaAsset" ADD COLUMN "materialClass" TEXT NOT NULL DEFAULT 'UNCONFIRMED';
ALTER TABLE "MediaAsset" ADD COLUMN "materialForm" TEXT NOT NULL DEFAULT 'UNKNOWN';
CREATE INDEX "MediaAsset_brandId_materialClass_folderId_idx" ON "MediaAsset"("brandId", "materialClass", "folderId");
