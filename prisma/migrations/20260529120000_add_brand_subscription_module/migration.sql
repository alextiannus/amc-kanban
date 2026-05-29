-- CreateTable
CREATE TABLE "BrandSubscription" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "billedMonths" INTEGER NOT NULL,
    "monthlyBaseUsd" INTEGER NOT NULL,
    "recurringAddonsUsd" INTEGER NOT NULL DEFAULT 0,
    "oneTimeAddonsUsd" INTEGER NOT NULL DEFAULT 0,
    "totalDueUsd" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentProvider" TEXT,
    "paymentSessionId" TEXT,
    "paymentUrl" TEXT,
    "selectedAddons" JSONB,
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandSubscription_paymentSessionId_key" ON "BrandSubscription"("paymentSessionId");

-- CreateIndex
CREATE INDEX "BrandSubscription_brandId_status_idx" ON "BrandSubscription"("brandId", "status");

-- CreateIndex
CREATE INDEX "BrandSubscription_createdById_idx" ON "BrandSubscription"("createdById");

-- AddForeignKey
ALTER TABLE "BrandSubscription" ADD CONSTRAINT "BrandSubscription_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandSubscription" ADD CONSTRAINT "BrandSubscription_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
