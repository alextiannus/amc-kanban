ALTER TABLE "BrandFolder"
  ADD COLUMN "systemKey" TEXT,
  ADD COLUMN "folderKind" TEXT NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "templateVersion" TEXT;

CREATE UNIQUE INDEX "BrandFolder_brandId_systemKey_key" ON "BrandFolder"("brandId", "systemKey");

CREATE TABLE "AssetCollection" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'SCRIPT',
  "creativeId" TEXT NOT NULL,
  "creativeVersion" INTEGER NOT NULL DEFAULT 0,
  "month" TEXT,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'WAITING_FOR_ASSETS',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetCollection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssetCollection_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssetCollection_brandId_kind_creativeId_key" ON "AssetCollection"("brandId", "kind", "creativeId");
CREATE INDEX "AssetCollection_brandId_status_updatedAt_idx" ON "AssetCollection"("brandId", "status", "updatedAt");

CREATE TABLE "AssetCollectionSlot" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "slotKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "requirement" TEXT NOT NULL,
  "expectedTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "order" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'MISSING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetCollectionSlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssetCollectionSlot_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "AssetCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssetCollectionSlot_collectionId_slotKey_key" ON "AssetCollectionSlot"("collectionId", "slotKey");
CREATE INDEX "AssetCollectionSlot_collectionId_order_idx" ON "AssetCollectionSlot"("collectionId", "order");

CREATE TABLE "AssetCollectionItem" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "slotId" TEXT,
  "role" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "uploadOrigin" TEXT NOT NULL DEFAULT 'LIBRARY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetCollectionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssetCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "AssetCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetCollectionItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetCollectionItem_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AssetCollectionSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssetCollectionItem_collectionId_assetId_key" ON "AssetCollectionItem"("collectionId", "assetId");
CREATE INDEX "AssetCollectionItem_assetId_idx" ON "AssetCollectionItem"("assetId");
CREATE INDEX "AssetCollectionItem_slotId_order_idx" ON "AssetCollectionItem"("slotId", "order");
