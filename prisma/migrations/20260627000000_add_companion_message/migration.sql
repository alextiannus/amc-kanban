-- CreateTable
CREATE TABLE "CompanionMessage" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "action" TEXT,
    "draftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanionMessage_brandId_userId_idx" ON "CompanionMessage"("brandId", "userId");

-- CreateIndex
CREATE INDEX "CompanionMessage_createdAt_idx" ON "CompanionMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "CompanionMessage" ADD CONSTRAINT "CompanionMessage_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
