-- History deletion preserves job lineage, media and billing records.
ALTER TABLE "VideoProductionJob" ADD COLUMN IF NOT EXISTS "historyDeletedAt" TIMESTAMP(3);
