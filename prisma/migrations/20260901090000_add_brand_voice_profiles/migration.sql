ALTER TABLE "BrandKnowledge" ADD COLUMN IF NOT EXISTS "companionVoiceId" TEXT;
ALTER TABLE "BrandKnowledge" ADD COLUMN IF NOT EXISTS "brandVoiceProfiles" JSONB;
ALTER TABLE "BrandKnowledge" ADD COLUMN IF NOT EXISTS "defaultBrandVoiceProfileId" TEXT;

UPDATE "BrandKnowledge"
SET "companionVoiceId" = "voiceId"
WHERE "companionVoiceId" IS NULL
  AND "voiceId" IS NOT NULL
  AND length(trim("voiceId")) > 0;
