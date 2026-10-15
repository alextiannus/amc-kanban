-- Supports the two bounded event streams and stable (createdAt,id) keyset cursor.
CREATE INDEX "BrandMarketingSolution_feedback_window_idx"
ON "BrandMarketingSolution"("brandId", "kind", "createdAt", "id");
