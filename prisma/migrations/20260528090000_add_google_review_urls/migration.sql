-- Add brand-level Google review URLs for QR review publishing flows
ALTER TABLE "Brand"
ADD COLUMN "googleBusinessUrl" TEXT,
ADD COLUMN "googleReviewUrl" TEXT;
