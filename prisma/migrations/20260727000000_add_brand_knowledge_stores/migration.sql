-- Add structured multi-store operating information to brand knowledge.
ALTER TABLE "BrandKnowledge" ADD COLUMN "stores" JSONB;
