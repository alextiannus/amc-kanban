ALTER TABLE "BrandKnowledge" ADD COLUMN "brandVoice" TEXT;
ALTER TABLE "BrandKnowledge" ADD COLUMN "brandImage" TEXT;
ALTER TABLE "BrandKnowledge" ADD COLUMN "promotionFocus" TEXT;

UPDATE "BrandKnowledge"
SET
  "brandVoice" = NULLIF(BTRIM("promoPlan"->>'brandVoice'), ''),
  "brandImage" = NULLIF(BTRIM("promoPlan"->>'brandImage'), ''),
  "promotionFocus" = NULLIF(BTRIM("promoPlan"->>'direction'), '')
WHERE "promoPlan" IS NOT NULL;
