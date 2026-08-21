CREATE TABLE IF NOT EXISTS "BrandPlanInterview" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "rawNotes" TEXT NOT NULL,
    "answers" JSONB,
    "summary" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandPlanInterview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BrandPlanInterview_brandId_completedAt_idx" ON "BrandPlanInterview"("brandId", "completedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BrandPlanInterview_brandId_fkey'
  ) THEN
    ALTER TABLE "BrandPlanInterview"
      ADD CONSTRAINT "BrandPlanInterview_brandId_fkey"
      FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
