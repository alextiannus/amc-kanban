CREATE TABLE "PostfastInboxConversation" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "accountId" TEXT,
  "providerId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "subject" TEXT,
  "participantName" TEXT,
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "needsAttention" BOOLEAN NOT NULL DEFAULT false,
  "lastMessageAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PostfastInboxConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PostfastInboxItem" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "authorName" TEXT,
  "body" TEXT,
  "direction" TEXT,
  "state" TEXT,
  "unread" BOOLEAN NOT NULL DEFAULT false,
  "canReply" BOOLEAN NOT NULL DEFAULT false,
  "canPrivateReply" BOOLEAN NOT NULL DEFAULT false,
  "maxReplyLength" INTEGER,
  "replyWindowEndsAt" TIMESTAMP(3),
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PostfastInboxItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PostfastInboxConversation_brandId_providerId_key"
ON "PostfastInboxConversation"("brandId", "providerId");
CREATE INDEX "PostfastInboxConversation_brandId_unreadCount_needsAttention_idx"
ON "PostfastInboxConversation"("brandId", "unreadCount", "needsAttention");
CREATE INDEX "PostfastInboxConversation_accountId_idx"
ON "PostfastInboxConversation"("accountId");
CREATE UNIQUE INDEX "PostfastInboxItem_conversationId_providerId_key"
ON "PostfastInboxItem"("conversationId", "providerId");
CREATE INDEX "PostfastInboxItem_conversationId_unread_idx"
ON "PostfastInboxItem"("conversationId", "unread");

ALTER TABLE "PostfastInboxConversation"
ADD CONSTRAINT "PostfastInboxConversation_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostfastInboxConversation"
ADD CONSTRAINT "PostfastInboxConversation_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PostfastInboxItem"
ADD CONSTRAINT "PostfastInboxItem_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "PostfastInboxConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;