# Collector Modules

Brand Intelligence Intake uses pluggable collectors. Each collector should return evidence without writing the final report directly.

## Current Active Collectors

| Collector | Purpose | Output |
| --- | --- | --- |
| `submitted-url-metadata` | Fetch merchant-submitted public URLs and extract title, description, snippet, status, final URL, and content type. | `public_sources` |
| `amc-knowledge-index` | Match the merchant market/category/channel terms against AMC Growth knowledge entries. | `knowledge_matches` |
| `external-agent-evidence` | Merge evidence collected by an external AI Agent. | `public_sources`, `collection_notes` |

## Registered Planned Collectors

| Collector | Purpose | Suggested Implementation |
| --- | --- | --- |
| `crawlee-playwright` | Crawl merchant websites and dynamic public pages. | Crawlee + Playwright |
| `osm-overpass` | Collect trade-area POI and competitor density. | OpenStreetMap Overpass API |
| `google-places` | Collect structured Google Business Profile facts. | Google Places API or approved provider |
| `social-profile-enrichment` | Collect public social activity and account performance. | Official APIs or replaceable scrapers |

## Provider Rules

- Keep each provider behind a module boundary.
- Return normalized evidence; do not let provider-specific fields leak into report templates unless copied into a normalized field.
- Preserve raw source URLs and timestamps.
- Mark unavailable providers as `available_not_configured`, `blocked`, `rate_limited`, or `failed`.
- Do not block report generation because one provider fails.
- Prefer official APIs for production customer-facing facts when ToS or stability matters.

## Collector Run Shape

```json
{
  "collector_id": "submitted-url-metadata",
  "status": "completed",
  "notes": ["Submitted public links were fetched for page metadata and snippets."]
}
```

Valid statuses:

- `completed`
- `skipped`
- `available_not_configured`
- `blocked`
- `rate_limited`
- `failed`

## AMC Growth Discovery Endpoint

Use:

```http
GET /v1/brand-intelligence-collectors
Authorization: Bearer <AMC_GROWTH_TOKEN>
```

The response lists active and planned collectors so external Agents can adapt to the current deployment.
