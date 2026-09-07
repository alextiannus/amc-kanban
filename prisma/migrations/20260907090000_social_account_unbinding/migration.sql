ALTER TABLE "SocialAccount" ADD COLUMN "unboundAt" TIMESTAMP(3), ADD COLUMN "postfastAccountId" TEXT;
CREATE UNIQUE INDEX "SocialAccount_brandId_postfastAccountId_key" ON "SocialAccount"("brandId", "postfastAccountId");
