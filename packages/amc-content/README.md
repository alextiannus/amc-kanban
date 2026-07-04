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

## Model profile architecture

Platform copywriters do not own raw API keys. They select model profiles, and the runtime adapter resolves provider credentials from the host application:

```text
Platform Copywriter
  -> Prompt / Skill / Validation
  -> Model Profile
  -> Provider Config
  -> API key env var
```

Model profiles live in:

```text
packages/amc-content/src/modelProfiles.ts
```

Initial platform mapping:

- Instagram and Facebook: `local_social_balanced_v1`
- Google Business Profile: `local_seo_precise_v1`
- Xiaohongshu: `local_social_creative_v1`
- TikTok: `short_video_native_v1`

Provider credentials are resolved by `amc-kanban` through env vars such as:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `DEEPSEEK_API_KEY`

The model profile also supports fallback profile ids. If the configured content profile fails, `amc-kanban` tries those fallbacks first, then falls back to the existing `callLLM('copywriting')` router so existing DB/system LLM configuration remains compatible.

Optional per-profile model override:

```bash
AMC_CONTENT_MODEL_LOCAL_SOCIAL_BALANCED_V1_MODEL=gpt-4.1-mini
```

## Research-informed platform defaults

Initial prompt and validation choices are based on a small research pass across official platform guidance and current social content practice:

- Instagram: caption keywords matter for discovery, and hashtags should be selective rather than spammy; the current provider uses natural caption SEO plus 3-5 relevant hashtags.
- Google Business Profile: posts should be relevant and timely, comply with restricted-content policies, and avoid phone stuffing in post text; the provider now uses address/website/native call-button wording instead of writing phone numbers.
- TikTok: creative should be TikTok-first, human, vertical/video-aware, and follow hook-body-close structure; the provider keeps captions short and video-supportive.
- Xiaohongshu: content should feel like a useful local-life note, with scenario, practical detail, suitable audience, local route/proof, and low-template language.

## Admin UI

`amc-kanban` exposes an internal tuning workspace at:

```text
/admin/content-lab
```

The lab can:

- Generate real content through `amc-content`.
- Show the active platform copywriter provider, version, prompt style, best-fit use cases, and concurrency setting.
- Show the active model profile, provider, model name, API-key env var, temperature, and fallback profile chain.
- Inspect output, hook, quality issues, and provenance.
- Review and edit legacy platform `SKILL.md` files.
- Review and edit active prompt tuning notes for the new engine.

Prompt tuning notes are stored in:

```text
packages/amc-content/config/prompt-tuning.json
```

These notes are injected into the live `amc-content` pipeline through the `PromptTuningRepository` adapter.

## Runtime API facade

`amc-kanban` exposes a stable content-generation facade for both kanban UI flows and external callers such as `amc-mm`:

```text
POST /api/content/generate
```

Authentication:

- Browser session, or
- AMC agent API key through `x-api-key` / `Authorization: Bearer ...`

Request:

```json
{
  "brandId": "brand_id",
  "platform": "instagram",
  "industryVertical": "fitness_pilates",
  "theme": "Promote weekday lunch-time reformer pilates trial classes",
  "angle": "lunch break reset",
  "customerIntent": "trial_class",
  "localProof": ["Tanjong Pagar", "45-minute class"],
  "mustMention": ["trial class"],
  "mustAvoid": ["guaranteed results"],
  "mediaUrls": ["https://example.com/studio.jpg"],
  "fallbackToLegacy": true
}
```

Response:

```json
{
  "success": true,
  "latencyMs": 1234,
  "caption": "...",
  "hashtags": ["sgpilates"],
  "contentEngine": "amc-content",
  "fallbackUsed": false,
  "quality": {},
  "provenance": {}
}
```

The facade always tries `amc-content` first. If it fails and `fallbackToLegacy !== false`, it falls back to the legacy `copywriterNode` path with `skipAmcContent=true` to avoid recursive retries. Existing kanban bulk-generation now uses the same service layer, so `amc-kanban` and `amc-mm` can converge on this API while preserving old behavior as fallback.

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

Run integration guards for the kanban/content-engine boundary:

```bash
npm run test:content-engine-integration
```

## Examples

See [examples/platform-examples.md](./examples/platform-examples.md) for starter gold examples across Instagram, Google Business Profile/Google Maps, and Xiaohongshu.
