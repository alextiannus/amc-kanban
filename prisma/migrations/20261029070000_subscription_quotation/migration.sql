CREATE TABLE "SubscriptionQuotation" (
    "subscriptionId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "pdf" BYTEA,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "leaseToken" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "messageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubscriptionQuotation_pkey" PRIMARY KEY ("subscriptionId")
);
CREATE INDEX "SubscriptionQuotation_state_nextAttemptAt_idx" ON "SubscriptionQuotation"("state", "nextAttemptAt");
