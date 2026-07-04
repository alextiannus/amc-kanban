# amc-content

Core AMC content engine package.

This package owns platform copywriter strategy, vertical strategy, content quality gates, and pure orchestration logic. It does not own auth, Prisma, Next.js routes, scheduling, or publishing.

Boundary:

- `amc-content`: how to produce and validate strong local lifestyle content.
- `amc-kanban`: who can generate, which brand it belongs to, where drafts are stored, how jobs are queued, and when content is published.

Initial integration should inject adapters for model routing, knowledge retrieval, and generation logging from `amc-kanban`.
