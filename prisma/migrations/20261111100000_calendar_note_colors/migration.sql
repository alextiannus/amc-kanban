CREATE TYPE "CalendarNoteColor" AS ENUM ('yellow', 'green');

ALTER TABLE "CalendarNote" ADD COLUMN "color" "CalendarNoteColor" NOT NULL DEFAULT 'yellow';
