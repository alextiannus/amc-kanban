-- Phase 1: Agent assignment pool core models

CREATE TABLE IF NOT EXISTS "AssignmentPoolConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "overflowPolicy" TEXT NOT NULL DEFAULT 'fallback_only',
  "rebalancePolicy" TEXT NOT NULL DEFAULT 'manual_only',
  "matchingOrder" TEXT NOT NULL DEFAULT 'industry_first',
  "fallbackAgentId" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssignmentPoolConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssignmentPoolMember" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "capacity" INTEGER NOT NULL DEFAULT 30,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "industries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssignmentPoolMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssignmentDecisionLog" (
  "id" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "requestedIndustry" TEXT,
  "requestedRegion" TEXT,
  "referenceCode" TEXT,
  "matchedBy" TEXT,
  "selectedAgentId" TEXT,
  "reason" TEXT,
  "createdBy" TEXT NOT NULL DEFAULT 'system',
  "overflowHandled" BOOLEAN NOT NULL DEFAULT false,
  "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssignmentDecisionLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "statusCode" INTEGER,
  "response" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AssignmentPoolMember_agentId_key"
ON "AssignmentPoolMember"("agentId");

CREATE INDEX IF NOT EXISTS "AssignmentPoolMember_active_priority_idx"
ON "AssignmentPoolMember"("active", "priority");

CREATE INDEX IF NOT EXISTS "AssignmentDecisionLog_subjectType_subjectId_idx"
ON "AssignmentDecisionLog"("subjectType", "subjectId");

CREATE INDEX IF NOT EXISTS "AssignmentDecisionLog_selectedAgentId_idx"
ON "AssignmentDecisionLog"("selectedAgentId");

CREATE INDEX IF NOT EXISTS "AssignmentDecisionLog_createdAt_idx"
ON "AssignmentDecisionLog"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyRecord_scope_key_key"
ON "IdempotencyRecord"("scope", "key");

CREATE INDEX IF NOT EXISTS "IdempotencyRecord_expiresAt_idx"
ON "IdempotencyRecord"("expiresAt");
