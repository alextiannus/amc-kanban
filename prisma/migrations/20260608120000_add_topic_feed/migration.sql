-- CreateTable
CREATE TABLE "TopicFeed" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "summary" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdByType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicFeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopicFeed_brandId_updatedAt_idx" ON "TopicFeed"("brandId", "updatedAt");

-- CreateIndex
CREATE INDEX "TopicFeed_brandId_status_idx" ON "TopicFeed"("brandId", "status");

-- AddForeignKey
ALTER TABLE "TopicFeed" ADD CONSTRAINT "TopicFeed_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
