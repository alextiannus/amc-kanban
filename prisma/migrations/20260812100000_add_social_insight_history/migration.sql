CREATE TABLE "SocialInsightPost" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "externalId" TEXT,
    "platform" TEXT NOT NULL,
    "handle" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "postUrl" TEXT,
    "contentType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "raw" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialInsightPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialInsightPostMetric" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialInsightPostMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialInsightReview" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "externalId" TEXT,
    "platform" TEXT NOT NULL,
    "reviewerName" TEXT,
    "rating" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "replyText" TEXT,
    "reviewUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialInsightReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialInsightAccountMetric" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followerCount" INTEGER,
    "followingCount" INTEGER,
    "postCount" INTEGER,
    "ratingScore" DOUBLE PRECISION,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialInsightAccountMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialInsightPost_brandId_source_sourceKey_key" ON "SocialInsightPost"("brandId", "source", "sourceKey");
CREATE INDEX "SocialInsightPost_brandId_publishedAt_idx" ON "SocialInsightPost"("brandId", "publishedAt");
CREATE INDEX "SocialInsightPost_brandId_platform_publishedAt_idx" ON "SocialInsightPost"("brandId", "platform", "publishedAt");
CREATE UNIQUE INDEX "SocialInsightPostMetric_postId_snapshotDate_key" ON "SocialInsightPostMetric"("postId", "snapshotDate");
CREATE INDEX "SocialInsightPostMetric_snapshotDate_idx" ON "SocialInsightPostMetric"("snapshotDate");
CREATE UNIQUE INDEX "SocialInsightReview_brandId_source_sourceKey_key" ON "SocialInsightReview"("brandId", "source", "sourceKey");
CREATE INDEX "SocialInsightReview_brandId_publishedAt_idx" ON "SocialInsightReview"("brandId", "publishedAt");
CREATE INDEX "SocialInsightReview_brandId_platform_publishedAt_idx" ON "SocialInsightReview"("brandId", "platform", "publishedAt");
CREATE UNIQUE INDEX "SocialInsightAccountMetric_brandId_platform_handle_snapshotDate_key" ON "SocialInsightAccountMetric"("brandId", "platform", "handle", "snapshotDate");
CREATE INDEX "SocialInsightAccountMetric_brandId_snapshotDate_idx" ON "SocialInsightAccountMetric"("brandId", "snapshotDate");
CREATE INDEX "SocialInsightAccountMetric_brandId_platform_snapshotDate_idx" ON "SocialInsightAccountMetric"("brandId", "platform", "snapshotDate");

ALTER TABLE "SocialInsightPost" ADD CONSTRAINT "SocialInsightPost_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialInsightPostMetric" ADD CONSTRAINT "SocialInsightPostMetric_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialInsightPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialInsightReview" ADD CONSTRAINT "SocialInsightReview_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialInsightAccountMetric" ADD CONSTRAINT "SocialInsightAccountMetric_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
