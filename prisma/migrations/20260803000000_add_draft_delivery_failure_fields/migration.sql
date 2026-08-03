ALTER TABLE "ContentDraft"
ADD COLUMN "deliveryFailureCode" TEXT,
ADD COLUMN "deliveryFailureAt" TIMESTAMP(3);
