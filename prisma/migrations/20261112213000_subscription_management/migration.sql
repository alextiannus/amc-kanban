ALTER TABLE "BrandSubscription"
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancellationRequestedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

CREATE TABLE "SubscriptionInvoiceRequest" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "requestedById" TEXT,
  "companyName" TEXT NOT NULL,
  "uen" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionInvoiceRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionInvoiceRequest_subscriptionId_createdAt_idx" ON "SubscriptionInvoiceRequest"("subscriptionId", "createdAt");
CREATE INDEX "SubscriptionInvoiceRequest_brandId_status_idx" ON "SubscriptionInvoiceRequest"("brandId", "status");
ALTER TABLE "SubscriptionInvoiceRequest" ADD CONSTRAINT "SubscriptionInvoiceRequest_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BrandSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionInvoiceRequest" ADD CONSTRAINT "SubscriptionInvoiceRequest_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionInvoiceRequest" ADD CONSTRAINT "SubscriptionInvoiceRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
