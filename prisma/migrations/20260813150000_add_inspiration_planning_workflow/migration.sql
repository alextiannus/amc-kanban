CREATE TABLE "PlanningReview" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "resourceVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanningReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialRequirement" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "remotePlanId" TEXT NOT NULL,
  "remotePlanVersion" INTEGER NOT NULL,
  "remotePlanItemId" TEXT NOT NULL,
  "requirementKey" TEXT NOT NULL,
  "specification" JSONB NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'MISSING',
  "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaterialRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialSubmission" (
  "id" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "note" TEXT,
  "submittedBy" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaterialSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanningReview_brandId_resourceType_resourceId_resourceVersion_key" ON "PlanningReview"("brandId", "resourceType", "resourceId", "resourceVersion");
CREATE INDEX "PlanningReview_brandId_status_idx" ON "PlanningReview"("brandId", "status");
CREATE UNIQUE INDEX "MaterialRequirement_brandId_remotePlanItemId_requirementKey_key" ON "MaterialRequirement"("brandId", "remotePlanItemId", "requirementKey");
CREATE INDEX "MaterialRequirement_brandId_remotePlanId_status_idx" ON "MaterialRequirement"("brandId", "remotePlanId", "status");
CREATE UNIQUE INDEX "MaterialSubmission_requirementId_assetId_key" ON "MaterialSubmission"("requirementId", "assetId");
CREATE INDEX "MaterialSubmission_assetId_idx" ON "MaterialSubmission"("assetId");

ALTER TABLE "PlanningReview" ADD CONSTRAINT "PlanningReview_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialRequirement" ADD CONSTRAINT "MaterialRequirement_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialSubmission" ADD CONSTRAINT "MaterialSubmission_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "MaterialRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialSubmission" ADD CONSTRAINT "MaterialSubmission_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
