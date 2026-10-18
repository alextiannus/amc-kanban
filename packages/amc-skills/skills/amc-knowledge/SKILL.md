---
name: amc-knowledge
description: "Use this skill when managing AMC Growth knowledge: ingesting merchant notes, post examples, tracked accounts, service-plan scoped growth plans, generated indexes, API exports, and dashboard-ready outputs in the amc-growth repository."
---

# AMC Knowledge

Use this skill when a user wants to add, update, query, or publish AMC Growth knowledge.

## Repository

Use the user-selected `amc-growth` checkout. Verify its repository identity before running commands; do not assume a machine-specific absolute path.

## Core Rule

Treat `amc-growth` as an AI-managed knowledge system:

1. Raw user/AI input goes into `inbox/`.
2. Reviewed facts are curated into `merchants/`, `knowledge/`, or `intelligence/`.
3. Run index, validation, export, and page generation.
4. Consumers read `generated/` through API, dashboard embedding, or static pages.

Do not store passwords, OTPs, private tokens, cookies, or unredacted credentials.

## Common Workflows

### Ingest New Information

When the user provides new merchant facts, interviews, post examples, account observations, or market notes:

1. Identify target merchant and information type.
2. Create or update an intake note under `inbox/`.
3. Extract confirmed facts and open questions.
4. Curate confirmed facts into the right official files.
5. Run:

```bash
npm run build:index
npm run validate
```

For detailed intake rules, read `references/intake-workflow.md`.

### Update Merchant Plan

When updating a merchant plan:

1. Read `merchants/{merchantId}/profile.md`.
2. Check `amc_plan`.
3. Read the matching service plan in `knowledge/service-plans/`.
4. Update `research.md`, `growth-plan.md`, `presentation.md`, and `content-briefs.md` as needed.
5. Preserve the split between best strategy, subscribed-plan implementation, and upgrade discussion.
6. Run:

```bash
npm run export:merchant {merchantId}
npm run build:merchant-page {merchantId}
```

For plan rules, read `references/service-plan-scoping.md`.

### Add Post Examples Or Account Tracking

Use `intelligence/`:

- Good post examples: `intelligence/post-examples/`
- Tracked accounts: `intelligence/tracked-accounts/`
- Weekly digests: `intelligence/weekly-digests/`

For schemas, read `references/file-schemas.md`.

### Publish For Consumers

Consumer outputs live in:

```text
generated/
```

Run:

```bash
npm run run:dongbei
```

or for a specific merchant:

```bash
npm run build:index
npm run validate
npm run export:merchant {merchantId}
npm run build:merchant-page {merchantId}
```

For API and dashboard contracts, read `references/consumer-contracts.md`.
For AI Agent data collection and upload instructions, read `references/agent-data-collection-guide.md`.

## Quality Bar

Before finalizing any knowledge update:

- Confirm the source type: public source, merchant-provided, operator observation, or AI inference.
- Mark unverified claims clearly.
- Keep raw notes in `inbox/`; official files should contain reviewed facts.
- Audit online presence (SEO visibility, GEO AI recommendations, Google Maps details) and save under `merchants/{merchantId}/online-presence.md` using the [Online Presence Guide](references/agent-data-collection-guide.md#4-online-presence-audit-seo-geo--google-maps-网络表现审计).
- Run validation.
- Tell the user what files changed and what outputs were regenerated.
