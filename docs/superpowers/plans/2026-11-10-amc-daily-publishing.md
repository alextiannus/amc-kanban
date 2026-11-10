# AMC daily publishing implementation plan

Goal: keep seven days of source-backed reviewable content for the authorized AMC accounts, deliver exact human-approved schedules and notify shortages/failures.
Architecture: explicit AMC-only policy in PostgreSQL; persistent per-account/local-date slots; a bounded refill worker using existing Content model configuration and OBS; existing exact approval and durable delivery. Native/external assistants share source/status/refill capabilities.

- [x] Add source registry with Academy/articles, published captions and all-brand assets, source fingerprints, restriction checks and deterministic diversity selection.
- [x] Add policy/slot storage, advisory locks, durable generation state, seven-day gap reconciliation, owner notices and restart-safe bounded worker. No automatic retry of unknown model/publication result.
- [x] Add own-brand authenticated operations page and exact-version review links; integrate the AMC daily cadence with shared scheduling, keeping existing approval boundary.
- [x] Add shared native/external read/refill tools and delivery source revalidation.
- [x] Run real PostgreSQL end-to-end fixtures, route authorization, content/source mutation, concurrency and failure notice tests; typecheck/build and review/fix findings.
- [ ] Selectively push, wait for exact production SHA, enable authorized AMC policy, build real unapproved stock and verify stored inventory/notifications. Human approval and actual platform publication remain separately evidenced.
