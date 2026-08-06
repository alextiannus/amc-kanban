ALTER TABLE "GameSpinLog"
ADD COLUMN "prizeNameSnapshot" TEXT,
ADD COLUMN "prizeTypeSnapshot" TEXT,
ADD COLUMN "prizeImageSnapshot" TEXT;

UPDATE "GameSpinLog" AS spin
SET
  "prizeNameSnapshot" = prize."name",
  "prizeTypeSnapshot" = prize."type",
  "prizeImageSnapshot" = prize."imageUrl"
FROM "GamePrize" AS prize
WHERE spin."prizeId" = prize."id";

ALTER TABLE "GameSpinLog"
ALTER COLUMN "prizeNameSnapshot" SET NOT NULL,
ALTER COLUMN "prizeTypeSnapshot" SET NOT NULL,
ALTER COLUMN "prizeId" DROP NOT NULL;

ALTER TABLE "GameSpinLog"
DROP CONSTRAINT "GameSpinLog_prizeId_fkey";

ALTER TABLE "GameSpinLog"
ADD CONSTRAINT "GameSpinLog_prizeId_fkey"
FOREIGN KEY ("prizeId") REFERENCES "GamePrize"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
