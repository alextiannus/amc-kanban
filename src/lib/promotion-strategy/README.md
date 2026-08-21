# Promotion Strategy Module

This module owns Kanban-side promotion strategy generation and review.

Boundaries:

- `amc-kanban` owns annual, quarterly and monthly strategy generation, promotion-point decomposition, candidate selection, date arrangement, owner review and execution handoff.
- `amc-growth` is called only for market calendar snapshots during strategy generation. Health reports and data insights are pre-generation inputs.
- `amc-content` is called per promotion point for creative candidates. It does not generate the publication calendar.
- `amc-mm` is not part of v1 display until the Kanban workflow is validated.

Main files:

- `clients.ts`: remote calls to Growth market calendar and Content creative candidate matching.
- `service.ts`: strategy generation, promotion-point decomposition and publication draft assembly.
- `route.ts`: shared Next.js API handlers for module routes.
