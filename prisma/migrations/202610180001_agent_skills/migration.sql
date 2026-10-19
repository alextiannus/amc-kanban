CREATE TABLE "AgentSkillSetting" (
  "agentId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "content" TEXT,
  "installed" BOOLEAN NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("agentId", "skillId")
);
