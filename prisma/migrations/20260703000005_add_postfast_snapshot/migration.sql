-- AddColumn: postfastSnapshot and postfastSyncedAt to Brand
-- These fields cache the nightly PostFast sync result so GET /api/brands/:id
-- never needs to call PostFast directly. Populated by /api/cron/postfast-sync-all.

ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "postfastSnapshot" JSONB;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "postfastSyncedAt" TIMESTAMP(3);
