-- DropForeignKey
ALTER TABLE "Brand" DROP CONSTRAINT "Brand_ownerId_fkey";

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "googleAccountId" TEXT,
ADD COLUMN     "googleLocationId" TEXT,
ADD COLUMN     "googleLocationName" TEXT,
ADD COLUMN     "googleRefreshToken" TEXT,
ALTER COLUMN "ownerId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "BrandOwner" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameConfig" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Lucky Spin Wheel',
    "description" TEXT,
    "themeColor" TEXT NOT NULL DEFAULT '#3b82f6',
    "taskPhotoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "taskReviewEnabled" BOOLEAN NOT NULL DEFAULT true,
    "taskGoogleMapsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "taskXiaohongshuEnabled" BOOLEAN NOT NULL DEFAULT true,
    "taskInstagramEnabled" BOOLEAN NOT NULL DEFAULT true,
    "clerkPin" TEXT NOT NULL DEFAULT '123456',
    "maxSpinsPerUserDay" INTEGER NOT NULL DEFAULT 3,
    "templateType" TEXT NOT NULL DEFAULT 'WHEEL',
    "posterTitle" TEXT NOT NULL DEFAULT 'Scan & Win!',
    "posterDesc" TEXT NOT NULL DEFAULT 'Leave a review to spin and win rewards instantly!',
    "posterTheme" TEXT NOT NULL DEFAULT 'black',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePrize" (
    "id" TEXT NOT NULL,
    "gameConfigId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "totalInventory" INTEGER,
    "claimedCount" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamePrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTaskSubmission" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "images" TEXT[],
    "imageMd5s" TEXT[],
    "copyrightAgreed" BOOLEAN NOT NULL DEFAULT true,
    "reviewPlatform" TEXT,
    "reviewTimeRaw" TEXT,
    "aiReason" TEXT,
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerTaskSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSpinLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "pointsDeducted" INTEGER NOT NULL DEFAULT 5,
    "redemptionCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNCLAIMED',
    "claimedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameSpinLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandOwner_brandId_idx" ON "BrandOwner"("brandId");

-- CreateIndex
CREATE INDEX "BrandOwner_userId_idx" ON "BrandOwner"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandOwner_brandId_userId_key" ON "BrandOwner"("brandId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameConfig_brandId_key" ON "GameConfig"("brandId");

-- CreateIndex
CREATE INDEX "GameSession_brandId_sessionId_idx" ON "GameSession"("brandId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "GameSession_brandId_sessionId_key" ON "GameSession"("brandId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "GameSpinLog_redemptionCode_key" ON "GameSpinLog"("redemptionCode");

-- AddForeignKey
ALTER TABLE "BrandOwner" ADD CONSTRAINT "BrandOwner_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandOwner" ADD CONSTRAINT "BrandOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameConfig" ADD CONSTRAINT "GameConfig_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePrize" ADD CONSTRAINT "GamePrize_gameConfigId_fkey" FOREIGN KEY ("gameConfigId") REFERENCES "GameConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTaskSubmission" ADD CONSTRAINT "CustomerTaskSubmission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSpinLog" ADD CONSTRAINT "GameSpinLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSpinLog" ADD CONSTRAINT "GameSpinLog_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "GamePrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
