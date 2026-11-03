-- Independent daily planning notes. Empty bodies retain their concurrency version.
CREATE TABLE "CalendarNote" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendarNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarNote_brandId_date_key" ON "CalendarNote"("brandId", "date");
ALTER TABLE "CalendarNote" ADD CONSTRAINT "CalendarNote_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
