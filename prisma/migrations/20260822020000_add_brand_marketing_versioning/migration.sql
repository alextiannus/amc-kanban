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
    'ops_strategy_essential',
    'essential',
    'Essential · 基础线上经营',
    '["每月不少于 12 次图文发布","Instagram 品牌门面和信任留存","TikTok 轻量曝光和兴趣种草","Google Map / Google Business Profile 最后一公里转化","每月 4 位 KOC/微型博主探店","每月舆情报告与下月优化建议"]'::jsonb,
    '["instagram","tiktok","google_business"]'::jsonb,
    12,
    '{"platforms":{"instagram":{"postsPerWeek":2},"tiktok":{"postsPerWeek":1},"google_business":{"postsPerWeek":1}}}'::jsonb,
    1,
    '{"positioning":"基础线上门面 + 稳定内容维护","promise":"让客户在 Instagram / TikTok / Google Map 上找得到、看得懂、愿意来。","platformRoles":{"instagram":"品牌门面和信任留存，呈现精品图文、Reels、菜单亮点、环境照、顾客场景和活动信息。","tiktok":"曝光和兴趣种草，发布新品、优惠、探店、制作过程、老板/员工出镜、顾客反应和节日活动。","google_business":"最后一公里转化，维护资料、菜单、营业时间、照片/视频、电话、链接和评论回复。"},"contentMix":["8 条品牌/产品内容","4 条活动/场景内容"],"reporting":"每月舆情报告：评论、评分变化、热门内容、客户反馈、下月优化建议。","bestFor":["新店开业","社媒断更","Google Map 信息不完整","老板没时间稳定发内容"],"constraints":["不包含小红书","不包含付费广告运营"]}'::jsonb
  ),
  (
    'ops_strategy_booster',
    'booster',
    'Booster · 增长战役版',
    '["每月至少 24 次内容发布（含图文与精品视频）","Instagram 品牌经营","TikTok 爆点内容","小红书中文搜索型生活方式笔记","Google Map 口碑和转化承接","定制月度增长策划案","专业素材采集","10 位博主分批探店","每周舆情与运营复盘"]'::jsonb,
    '["instagram","tiktok","xiaohongshu","google_business"]'::jsonb,
    24,
    '{"platforms":{"instagram":{"postsPerWeek":2},"tiktok":{"postsPerWeek":2},"xiaohongshu":{"postsPerWeek":1},"google_business":{"postsPerWeek":1}}}'::jsonb,
    1,
    '{"positioning":"增长战役 + 素材资产 + 博主扩散","promise":"用一个月把品牌内容、活动话题、博主探店和地图口碑一起推起来，让更多人看到、收藏、咨询、到店。","platformRoles":{"instagram":"从门面展示升级为品牌经营，覆盖招牌菜故事、套餐组合、活动海报、顾客场景、Reels、Story 互动。","tiktok":"主攻爆点内容，围绕价格锚点、反差卖点、制作过程、挑战话题、限时活动、探店视频连续发布。","xiaohongshu":"面向中文用户、中国游客、留学生和华语本地消费者，做可搜索、可收藏、可照着去的中文生活方式笔记。","google_business":"强化评论回复、差评修复、照片更新、菜单和热门产品呈现，把社媒种草流量接住。"},"contentMix":["每月 24 次内容发布","覆盖图文与精品视频","4 个内容主题周"],"creatorPlan":["6 位 2k+","3 位 4k+","1 位 1w+","分批发布，避免同一天刷屏"],"reporting":"每周舆情报告：曝光、互动、评论、收藏、私信、Google 评分、热门内容、下周调整动作。","bestFor":["新店开业或新菜单上线","节日档期推广","评分低或评论少的口碑修复","吸引游客和中文用户","商圈竞争强"],"constraints":["按月策划活动","内容产出需覆盖图文与短视频","重点看收藏、搜索、评论咨询和到店转化"]}'::jsonb
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
