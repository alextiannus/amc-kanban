CREATE TABLE IF NOT EXISTS "BrandGrowthResearchSnapshot" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'amc-growth',
  "sourceVersion" TEXT,
  "sourcePayload" JSONB,
  "report" JSONB NOT NULL,
  "dataHash" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandGrowthResearchSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrandMarketingSolution" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "input" JSONB NOT NULL,
  "output" JSONB NOT NULL,
  "generationMode" TEXT NOT NULL DEFAULT 'LLM',
  "llmProvider" TEXT,
  "llmModel" TEXT,
  "llmError" TEXT,
  "researchSnapshotId" TEXT,
  "createdById" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandMarketingSolution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SubscriptionOperationsStrategy" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "planName" TEXT NOT NULL,
  "includedServices" JSONB NOT NULL,
  "platformCoverage" JSONB NOT NULL,
  "monthlyContentQuota" INTEGER NOT NULL,
  "publishingFreq" JSONB NOT NULL,
  "storeLimit" INTEGER NOT NULL DEFAULT 1,
  "strategyNotes" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionOperationsStrategy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BrandGrowthResearchSnapshot_brandId_generatedAt_idx" ON "BrandGrowthResearchSnapshot"("brandId", "generatedAt");
CREATE INDEX IF NOT EXISTS "BrandGrowthResearchSnapshot_source_sourceVersion_idx" ON "BrandGrowthResearchSnapshot"("source", "sourceVersion");
CREATE INDEX IF NOT EXISTS "BrandMarketingSolution_brandId_kind_period_idx" ON "BrandMarketingSolution"("brandId", "kind", "period");
CREATE INDEX IF NOT EXISTS "BrandMarketingSolution_researchSnapshotId_idx" ON "BrandMarketingSolution"("researchSnapshotId");
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionOperationsStrategy_planId_key" ON "SubscriptionOperationsStrategy"("planId");
CREATE INDEX IF NOT EXISTS "SubscriptionOperationsStrategy_isActive_idx" ON "SubscriptionOperationsStrategy"("isActive");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BrandGrowthResearchSnapshot_brandId_fkey'
  ) THEN
    ALTER TABLE "BrandGrowthResearchSnapshot"
      ADD CONSTRAINT "BrandGrowthResearchSnapshot_brandId_fkey"
      FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BrandMarketingSolution_brandId_fkey'
  ) THEN
    ALTER TABLE "BrandMarketingSolution"
      ADD CONSTRAINT "BrandMarketingSolution_brandId_fkey"
      FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BrandMarketingSolution_researchSnapshotId_fkey'
  ) THEN
    ALTER TABLE "BrandMarketingSolution"
      ADD CONSTRAINT "BrandMarketingSolution_researchSnapshotId_fkey"
      FOREIGN KEY ("researchSnapshotId") REFERENCES "BrandGrowthResearchSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "SubscriptionOperationsStrategy" (
  "id", "planId", "planName", "includedServices", "platformCoverage",
  "monthlyContentQuota", "publishingFreq", "storeLimit", "strategyNotes"
) VALUES
  (
    'ops_strategy_starter',
    'starter',
    '自媒体基础运营',
    '["30-36条/月图文内容创作","Google Business + Facebook + Instagram + TikTok","评论监控","每月安排不少于 4 位博主探店","账号风格统一化设计"]'::jsonb,
    '["instagram","facebook","tiktok","google_business"]'::jsonb,
    30,
    '{"platforms":{"instagram":{"postsPerWeek":2},"facebook":{"postsPerWeek":2},"tiktok":{"postsPerWeek":2},"google_business":{"postsPerWeek":1}}}'::jsonb,
    1,
    '{"positioning":"基础数字存在与持续更新","constraints":["不包含小红书","不包含付费广告运营"]}'::jsonb
  ),
  (
    'ops_strategy_essential',
    'essential',
    'Growth · 品牌建设版',
    '["≥20条图文 + 8条短视频/月","5大平台全覆盖（含小红书）","评论监控与回复","每月最多30位博主探店","月度营销活动策划"]'::jsonb,
    '["instagram","facebook","tiktok","xiaohongshu","google_business"]'::jsonb,
    28,
    '{"platforms":{"instagram":{"postsPerWeek":2},"facebook":{"postsPerWeek":1},"tiktok":{"postsPerWeek":2},"xiaohongshu":{"postsPerWeek":1},"google_business":{"postsPerWeek":1}}}'::jsonb,
    1,
    '{"positioning":"品牌建设、视频内容与博主矩阵","constraints":["按月策划活动","内容产出需覆盖图文与短视频"]}'::jsonb
  ),
  (
    'ops_strategy_advanced',
    'advanced',
    '全域增长版',
    '["增长策略与账户搭建","多平台付费广告管理","头部 KOL 合作管理","私域社群运营","转化追踪与优化报告"]'::jsonb,
    '["instagram","facebook","tiktok","xiaohongshu","google_business","ads","wechat","whatsapp"]'::jsonb,
    38,
    '{"platforms":{"instagram":{"postsPerWeek":2},"facebook":{"postsPerWeek":2},"tiktok":{"postsPerWeek":3},"xiaohongshu":{"postsPerWeek":2},"google_business":{"postsPerWeek":1},"ads":{"postsPerWeek":1},"wechat":{"postsPerWeek":1},"whatsapp":{"postsPerWeek":1}}}'::jsonb,
    1,
    '{"positioning":"全域增长、投流与私域复购","constraints":["广告消耗费独立承担","需持续追踪转化指标"]}'::jsonb
  )
ON CONFLICT ("planId") DO UPDATE SET
  "planName" = EXCLUDED."planName",
  "includedServices" = EXCLUDED."includedServices",
  "platformCoverage" = EXCLUDED."platformCoverage",
  "monthlyContentQuota" = EXCLUDED."monthlyContentQuota",
  "publishingFreq" = EXCLUDED."publishingFreq",
  "storeLimit" = EXCLUDED."storeLimit",
  "strategyNotes" = EXCLUDED."strategyNotes",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
