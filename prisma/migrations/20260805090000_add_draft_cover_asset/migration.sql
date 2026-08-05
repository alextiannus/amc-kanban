ALTER TABLE "ContentDraft"
  ADD COLUMN "coverAssetId" TEXT;

CREATE INDEX "ContentDraft_coverAssetId_idx" ON "ContentDraft"("coverAssetId");

ALTER TABLE "ContentDraft"
  ADD CONSTRAINT "ContentDraft_coverAssetId_fkey"
  FOREIGN KEY ("coverAssetId") REFERENCES "MediaAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "BrandFolder" ("id", "brandId", "name", "createdAt", "updatedAt")
SELECT 'cover_' || md5(brand."id"), brand."id", '封面图', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Brand" AS brand
ON CONFLICT ("brandId", "name") DO NOTHING;
