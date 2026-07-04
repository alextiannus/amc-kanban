-- Auth V2 foundation is intentionally add-only.
-- Legacy authorization columns and tables remain available for rollback.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "authVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "UserApiKey"
  ALTER COLUMN "token" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "tokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "prefix" TEXT,
  ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "UserApiKey_tokenHash_key"
  ON "UserApiKey"("tokenHash");

CREATE INDEX IF NOT EXISTS "UserApiKey_userId_revokedAt_idx"
  ON "UserApiKey"("userId", "revokedAt");

ALTER TABLE "CrewMember"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'VIEWER',
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "CrewMember_userId_active_idx"
  ON "CrewMember"("userId", "active");

-- Global roles are explicit. Preserve current ADMIN assignments.
INSERT INTO "UserBusinessRole" ("id", "userId", "role", "createdAt", "updatedAt")
SELECT
  'migrated-admin-' || u."id",
  u."id",
  'ADMIN',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE u."role" = 'ADMIN'
ON CONFLICT ("userId", "role") DO NOTHING;

-- Existing AMC Agents need an explicit employee role before type-based
-- authorization is removed. Brand scope still limits them to their Crews.
INSERT INTO "UserBusinessRole" ("id", "userId", "role", "createdAt", "updatedAt")
SELECT
  'migrated-agent-role-' || u."id",
  u."id",
  'AMC_PRINCIPAL',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE u."type" = 'AI_AGENT'
ON CONFLICT ("userId", "role") DO NOTHING;

-- Ensure every brand has a MarketingCrew before membership backfill.
INSERT INTO "MarketingCrew" ("id", "brandId", "createdAt", "updatedAt")
SELECT
  'migrated-crew-' || b."id",
  b."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Brand" b
ON CONFLICT ("brandId") DO NOTHING;

-- Brand owners become direct OWNER members.
INSERT INTO "CrewMember" (
  "id", "crewId", "userId", "role", "active", "source", "joinedAt", "updatedAt"
)
SELECT
  'migrated-owner-' || bo."id",
  mc."id",
  bo."userId",
  'OWNER',
  true,
  'MIGRATION',
  bo."createdAt",
  CURRENT_TIMESTAMP
FROM "BrandOwner" bo
JOIN "MarketingCrew" mc ON mc."brandId" = bo."brandId"
ON CONFLICT ("crewId", "userId") DO UPDATE
SET "role" = 'OWNER', "active" = true;

-- Legacy single Brand.ownerId also becomes an OWNER member.
INSERT INTO "CrewMember" (
  "id", "crewId", "userId", "role", "active", "source", "joinedAt", "updatedAt"
)
SELECT
  'migrated-legacy-owner-' || b."id",
  mc."id",
  b."ownerId",
  'OWNER',
  true,
  'MIGRATION',
  b."createdAt",
  CURRENT_TIMESTAMP
FROM "Brand" b
JOIN "MarketingCrew" mc ON mc."brandId" = b."id"
WHERE b."ownerId" IS NOT NULL
ON CONFLICT ("crewId", "userId") DO UPDATE
SET "role" = 'OWNER', "active" = true;

-- Existing BrandAgent assignments become normal EDITOR members.
INSERT INTO "CrewMember" (
  "id", "crewId", "userId", "role", "active", "source", "joinedAt", "updatedAt"
)
SELECT
  'migrated-agent-' || ba."id",
  mc."id",
  ba."agentId",
  CASE WHEN ba."role" = 'lead' THEN 'PRINCIPAL' ELSE 'EDITOR' END,
  ba."active",
  'MIGRATION',
  ba."createdAt",
  CURRENT_TIMESTAMP
FROM "BrandAgent" ba
JOIN "MarketingCrew" mc ON mc."brandId" = ba."brandId"
ON CONFLICT ("crewId", "userId") DO UPDATE
SET "active" = EXCLUDED."active";

-- Humans previously connected only through AgentPermission inherit the
-- relevant Crew memberships once, so runtime authorization no longer needs
-- AgentPermission.
INSERT INTO "CrewMember" (
  "id", "crewId", "userId", "role", "active", "source", "joinedAt", "updatedAt"
)
SELECT DISTINCT
  'migrated-principal-' || ap."humanId" || '-' || mc."id",
  mc."id",
  ap."humanId",
  CASE
    WHEN EXISTS (
      SELECT 1 FROM "UserBusinessRole" ubr
      WHERE ubr."userId" = ap."humanId" AND ubr."role" = 'AMC_PRINCIPAL'
    ) THEN 'PRINCIPAL'
    ELSE 'VIEWER'
  END,
  true,
  'MIGRATION',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AgentPermission" ap
JOIN "BrandAgent" ba ON ba."agentId" = ap."agentId" AND ba."active" = true
JOIN "MarketingCrew" mc ON mc."brandId" = ba."brandId"
ON CONFLICT ("crewId", "userId") DO NOTHING;
