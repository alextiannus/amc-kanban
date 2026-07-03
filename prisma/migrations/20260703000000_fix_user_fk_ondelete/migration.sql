-- Add onDelete behavior to all User FK references that previously defaulted to RESTRICT.
-- This fixes FK constraint violations when deleting users who have associated records.

-- AgentPermission: both humanId and agentId are required; cascade-delete when user is deleted
ALTER TABLE "AgentPermission" DROP CONSTRAINT IF EXISTS "AgentPermission_humanId_fkey";
ALTER TABLE "AgentPermission" DROP CONSTRAINT IF EXISTS "AgentPermission_agentId_fkey";
ALTER TABLE "AgentPermission"
  ADD CONSTRAINT "AgentPermission_humanId_fkey"
  FOREIGN KEY ("humanId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentPermission"
  ADD CONSTRAINT "AgentPermission_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BrandAgent: agentId is required; cascade-delete the agent link
ALTER TABLE "BrandAgent" DROP CONSTRAINT IF EXISTS "BrandAgent_agentId_fkey";
ALTER TABLE "BrandAgent"
  ADD CONSTRAINT "BrandAgent_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BrandOwner: userId is required; cascade-delete ownership record
ALTER TABLE "BrandOwner" DROP CONSTRAINT IF EXISTS "BrandOwner_userId_fkey";
ALTER TABLE "BrandOwner"
  ADD CONSTRAINT "BrandOwner_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Comment (WorkUnit comments): authorId is required; cascade-delete comments
ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_authorId_fkey";
ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WorkUnit: assigneeId is optional; set null when user is deleted
ALTER TABLE "WorkUnit" DROP CONSTRAINT IF EXISTS "WorkUnit_assigneeId_fkey";
ALTER TABLE "WorkUnit"
  ADD CONSTRAINT "WorkUnit_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invitation: inviterId is optional; set null when inviter is deleted
ALTER TABLE "Invitation" DROP CONSTRAINT IF EXISTS "Invitation_inviterId_fkey";
ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_inviterId_fkey"
  FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invitation: inviteeUserId is optional; set null when invitee is deleted
ALTER TABLE "Invitation" DROP CONSTRAINT IF EXISTS "Invitation_inviteeUserId_fkey";
ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_inviteeUserId_fkey"
  FOREIGN KEY ("inviteeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SubscriptionRequest (ContentDraft): createdById is optional; set null
ALTER TABLE "SubscriptionRequest" DROP CONSTRAINT IF EXISTS "SubscriptionRequest_createdById_fkey";
ALTER TABLE "SubscriptionRequest"
  ADD CONSTRAINT "SubscriptionRequest_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- User self-reference: ownerId (avatar ownership); set null
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_ownerId_fkey";
ALTER TABLE "User"
  ADD CONSTRAINT "User_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- User self-reference: referredById (referral chain); set null
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_referredById_fkey";
ALTER TABLE "User"
  ADD CONSTRAINT "User_referredById_fkey"
  FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PromoCode: createdById is required; cascade-delete promo codes
ALTER TABLE "PromoCode" DROP CONSTRAINT IF EXISTS "PromoCode_createdById_fkey";
ALTER TABLE "PromoCode"
  ADD CONSTRAINT "PromoCode_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PromoCode: ownerId is optional; set null
ALTER TABLE "PromoCode" DROP CONSTRAINT IF EXISTS "PromoCode_ownerId_fkey";
ALTER TABLE "PromoCode"
  ADD CONSTRAINT "PromoCode_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SalesLead: bdUserId is now optional; set null when BD user is deleted
ALTER TABLE "SalesLead" ALTER COLUMN "bdUserId" DROP NOT NULL;
ALTER TABLE "SalesLead" DROP CONSTRAINT IF EXISTS "SalesLead_bdUserId_fkey";
ALTER TABLE "SalesLead"
  ADD CONSTRAINT "SalesLead_bdUserId_fkey"
  FOREIGN KEY ("bdUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
