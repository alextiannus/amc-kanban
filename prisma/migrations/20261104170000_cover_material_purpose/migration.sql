ALTER TABLE "MediaAsset" ADD COLUMN "isCoverMaterial" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "MediaAsset_brandId_isCoverMaterial_idx" ON "MediaAsset"("brandId", "isCoverMaterial");
