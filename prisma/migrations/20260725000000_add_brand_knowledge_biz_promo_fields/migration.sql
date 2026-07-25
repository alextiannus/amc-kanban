-- Migration: add business info, knowledge base, and promo plan fields to BrandKnowledge
-- Corresponds to the 4-tab brand story module redesign
-- All columns are nullable (backward-compatible with existing rows)

ALTER TABLE "BrandKnowledge"
  -- Business Info (Tab 2)
  ADD COLUMN IF NOT EXISTS "businessHours"  TEXT,
  ADD COLUMN IF NOT EXISTS "reservationUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "orderingUrl"    TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryUrls"   JSONB,

  -- Knowledge Base (Tab 3)
  ADD COLUMN IF NOT EXISTS "market"         TEXT,
  ADD COLUMN IF NOT EXISTS "district"       TEXT,
  ADD COLUMN IF NOT EXISTS "competitors"    JSONB,

  -- Promo Plan + Publishing Frequency (Tab 4)
  ADD COLUMN IF NOT EXISTS "promoPlan"      JSONB,
  ADD COLUMN IF NOT EXISTS "publishingFreq" JSONB;
