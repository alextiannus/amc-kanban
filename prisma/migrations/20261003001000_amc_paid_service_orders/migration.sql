ALTER TABLE "ImmediErpSync" ADD COLUMN "payload" JSONB;
CREATE TABLE "ImmediServiceOrder" (
 "id" TEXT NOT NULL PRIMARY KEY, "brandId" TEXT NOT NULL, "createdById" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "payload" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ImmediServiceOrder_requestKey_key" ON "ImmediServiceOrder"("requestKey");
CREATE INDEX "ImmediServiceOrder_brandId_createdAt_idx" ON "ImmediServiceOrder"("brandId", "createdAt");
