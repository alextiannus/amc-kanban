-- Add optional brand scoping to WorkUnit for multi-brand AI agent operations.
ALTER TABLE "WorkUnit" ADD COLUMN "brandId" TEXT;

ALTER TABLE "WorkUnit"
  ADD CONSTRAINT "WorkUnit_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WorkUnit_brandId_idx" ON "WorkUnit"("brandId");
CREATE INDEX "WorkUnit_assigneeId_brandId_idx" ON "WorkUnit"("assigneeId", "brandId");
