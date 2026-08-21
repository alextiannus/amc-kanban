ALTER TABLE "BrandKnowledge" ADD COLUMN IF NOT EXISTS "brandClaim" JSONB;
ALTER TABLE "BrandKnowledge" ADD COLUMN IF NOT EXISTS "researchReport" JSONB;
ALTER TABLE "BrandKnowledge" ADD COLUMN IF NOT EXISTS "marketingSolution" JSONB;

UPDATE "BrandKnowledge"
SET "researchReport" = COALESCE("researchReport", "brandPlan" -> 'researchReport'),
    "marketingSolution" = COALESCE("marketingSolution", "brandPlan")
WHERE "brandPlan" IS NOT NULL;
