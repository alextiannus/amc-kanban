ALTER TABLE "Brand" ADD COLUMN "manualStoreLimit" INTEGER;
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_manualStoreLimit_positive" CHECK ("manualStoreLimit" IS NULL OR "manualStoreLimit" > 0);
