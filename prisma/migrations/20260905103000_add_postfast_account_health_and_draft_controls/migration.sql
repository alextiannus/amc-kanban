ALTER TABLE "SocialAccount"
ADD COLUMN "connectionStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "disabledReason" TEXT,
ADD COLUMN "inboxCapable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "followerCountUpdatedAt" TIMESTAMP(3);

ALTER TABLE "ContentDraft"
ADD COLUMN "postfastControls" JSONB;