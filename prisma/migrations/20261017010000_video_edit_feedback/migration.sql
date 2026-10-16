-- Immutable producer event identity. The partial index does not alter legacy
-- period semantics for creative revisions, candidates or fidelity snapshots.
CREATE UNIQUE INDEX "BrandMarketingSolution_video_feedback_event_id_uq"
ON "BrandMarketingSolution"("period")
WHERE "kind" = 'VIDEO_EDIT_FEEDBACK';

CREATE INDEX "BrandMarketingSolution_video_feedback_window_idx"
ON "BrandMarketingSolution"("brandId", "createdAt", "id")
WHERE "kind" = 'VIDEO_EDIT_FEEDBACK';
