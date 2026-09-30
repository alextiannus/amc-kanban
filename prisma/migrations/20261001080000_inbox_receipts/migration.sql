CREATE TABLE "InboxReceipt" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "brandId" TEXT REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "key" TEXT NOT NULL, "remindedAt" TIMESTAMP(3), "readAt" TIMESTAMP(3), "state" TEXT NOT NULL DEFAULT 'active', "until" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "InboxReceipt_userId_key_key" ON "InboxReceipt"("userId", "key");
CREATE INDEX "InboxReceipt_userId_brandId_idx" ON "InboxReceipt"("userId", "brandId");
