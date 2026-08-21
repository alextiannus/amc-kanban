UPDATE "BrandSubscription"
SET "planId" = CASE
  WHEN "planId" = 'starter' THEN 'essential'
  WHEN "planId" = 'essential' THEN 'booster'
  WHEN "planId" IN ('advanced', 'premium') THEN 'booster'
  ELSE "planId"
END,
"planName" = CASE
  WHEN "planId" = 'starter' THEN 'Essential · 基础线上经营'
  WHEN "planId" = 'essential' THEN 'Booster · 增长战役版'
  WHEN "planId" IN ('advanced', 'premium') THEN 'Booster · 增长战役版'
  ELSE "planName"
END
WHERE "planId" IN ('starter', 'essential', 'advanced', 'premium');

DELETE FROM "SubscriptionOperationsStrategy"
WHERE "planId" IN ('starter', 'essential', 'booster');

DELETE FROM "SubscriptionOperationsStrategy"
WHERE "planId" IN ('advanced', 'legacy_advanced', 'premium');

INSERT INTO "SubscriptionOperationsStrategy" (
  "id", "planId", "planName", "includedServices", "platformCoverage",
  "monthlyContentQuota", "publishingFreq", "storeLimit", "strategyNotes", "isActive"
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
    '{"positioning":"基础线上门面 + 稳定内容维护","promise":"让客户在 Instagram / TikTok / Google Map 上找得到、看得懂、愿意来。","contentMix":["8 条品牌/产品内容","4 条活动/场景内容"],"reporting":"每月舆情报告：评论、评分变化、热门内容、客户反馈、下月优化建议。"}'::jsonb,
    true
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
    '{"positioning":"增长战役 + 素材资产 + 博主扩散","promise":"用一个月把品牌内容、活动话题、博主探店和地图口碑一起推起来，让更多人看到、收藏、咨询、到店。","contentMix":["每月 24 次内容发布","覆盖图文与精品视频","4 个内容主题周"],"creatorPlan":["6 位 2k+","3 位 4k+","1 位 1w+","分批发布，避免同一天刷屏"],"reporting":"每周舆情报告：曝光、互动、评论、收藏、私信、Google 评分、热门内容、下周调整动作。"}'::jsonb,
    true
  );
