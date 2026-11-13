ALTER TABLE "Brand"
  ADD COLUMN "workspaceKind" TEXT NOT NULL DEFAULT 'BRAND',
  ADD COLUMN "storeName" TEXT,
  ADD COLUMN "parentBrandId" TEXT;

CREATE INDEX "Brand_parentBrandId_status_idx" ON "Brand"("parentBrandId", "status");

ALTER TABLE "Brand"
  ADD CONSTRAINT "Brand_parentBrandId_fkey"
  FOREIGN KEY ("parentBrandId") REFERENCES "Brand"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Link the first production split when both workspaces exist. Names remain unchanged.
UPDATE "Brand"
SET "workspaceKind" = 'STORE', "storeName" = 'Jalan Besar旗舰店'
WHERE "id" = 'cmr1sictu003eio2auldwt26m';

UPDATE "Brand"
SET "workspaceKind" = 'STORE',
    "storeName" = 'Compassvale万国店',
    "parentBrandId" = 'cmr1sictu003eio2auldwt26m'
WHERE "id" = 'store_dongbeiren_compassvale_20261112'
  AND EXISTS (SELECT 1 FROM "Brand" WHERE "id" = 'cmr1sictu003eio2auldwt26m');
