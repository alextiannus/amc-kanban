ALTER TABLE "Brand"
  ADD COLUMN IF NOT EXISTS "growthBrandKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Brand_growthBrandKey_key"
  ON "Brand"("growthBrandKey");
