CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromptTemplate_taskKey_key" ON "PromptTemplate"("taskKey");
CREATE INDEX "PromptTemplate_isEnabled_idx" ON "PromptTemplate"("isEnabled");
CREATE INDEX "PromptTemplate_updatedAt_idx" ON "PromptTemplate"("updatedAt");
