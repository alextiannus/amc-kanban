# amc-content

Core AMC content engine package.

This package owns platform copywriter strategy, vertical strategy, content quality gates, and pure orchestration logic. It does not own auth, Prisma, Next.js routes, scheduling, or publishing.

Boundary:

- `amc-content`: how to produce and validate strong local lifestyle content.
- `amc-kanban`: who can generate, which brand it belongs to, where drafts are stored, how jobs are queued, and when content is published.

Initial integration should inject adapters for model routing, knowledge retrieval, and generation logging from `amc-kanban`.

## Current capabilities

- Platform providers for Xiaohongshu, Instagram, Facebook, Google Business Profile, and TikTok.
- Postiz-style platform copywriter registry:
  - `InstagramCopywriter`
  - `GoogleBusinessCopywriter`
  - `XiaohongshuCopywriter`
  - `FacebookCopywriter`
  - `TikTokCopywriter`
- Local lifestyle vertical strategy for F&B, beauty/wellness, fitness, home renovation, pets, education, healthcare, retail, events, professional services, and general local services.
- Deterministic quality gates for caption length, hashtag policy, media requirements, brand negative prompts, required address/CTA fields, and vertical-specific risky claims.
- Two-stage generation pipeline:
  1. hook candidates
  2. platform caption/body composition
  3. one quality rewrite pass when deterministic gates fail
- Output normalization for hook candidates, score ranges, duplicated hashtags, `#` prefixes, and no-hashtag platforms.
- Admin prompt tuning notes that can be appended to hook generation, body composition, or quality rewrite prompts by platform and vertical.

## Platform copywriter architecture

The external API remains simple:

```ts
createPlatformContent(input)
```

Internally, the pipeline resolves a dedicated copywriter provider:

```ts
const copywriter = getPlatformCopywriter(input.platform)
```

Each provider owns its own:

- hook strategy
- body prompt strategy
- rewrite strategy
- validation handoff
- profile metadata for UI display
- concurrency recommendation

This mirrors the Postiz provider pattern: a registry maps platform identifiers to dedicated provider objects, while the orchestration layer stays platform-agnostic.

## Admin UI

`amc-kanban` exposes an internal tuning workspace at:

```text
/admin/content-lab
```

The lab can:

- Generate real content through `amc-content`.
- Show the active platform copywriter provider, version, prompt style, best-fit use cases, and concurrency setting.
- Inspect output, hook, quality issues, and provenance.
- Review and edit legacy platform `SKILL.md` files.
- Review and edit active prompt tuning notes for the new engine.

Prompt tuning notes are stored in:

```text
packages/amc-content/config/prompt-tuning.json
```

These notes are injected into the live `amc-content` pipeline through the `PromptTuningRepository` adapter.

## Tests

Run the package-level test suite without calling any real LLM:

```bash
npm run test:amc-content
```

Run the package typecheck:

```bash
npm run typecheck:amc-content
```

The test suite currently covers provider rules, platform copywriter registry, deterministic quality gates, Google Business rewrite flow, knowledge/logger/prompt-tuning adapter contracts, media prompt inclusion, and output normalization.

## Examples

See [examples/platform-examples.md](./examples/platform-examples.md) for starter gold examples across Instagram, Google Business Profile/Google Maps, and Xiaohongshu.
