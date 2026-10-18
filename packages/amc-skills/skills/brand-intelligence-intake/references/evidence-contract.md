# Evidence Contract

Use this contract when an AI Agent collects data outside `amc-growth` and submits it back.

## Intake Payload

```json
{
  "brand_name": "Example Cafe",
  "market": "Singapore, Bugis",
  "category": "Restaurant / F&B",
  "contact_name": "Owner",
  "email": "owner@example.com",
  "website_url": "https://example.com",
  "google_maps_url": "https://maps.app.goo.gl/example",
  "instagram_url": "https://instagram.com/example",
  "facebook_url": "",
  "tiktok_url": "",
  "xiaohongshu_url": "",
  "other_links": "",
  "main_concern": "Want more local discovery",
  "report_tier": "initial",
  "external_evidence": {}
}
```

## Evidence Package

```json
{
  "schema_version": "amc.brand_intelligence.evidence.v1",
  "collected_at": "2026-07-16T00:00:00.000Z",
  "public_sources": [
    {
      "kind": "website",
      "collector_id": "external-agent",
      "submitted_url": "https://example.com",
      "final_url": "https://example.com/",
      "observed_at": "2026-07-16T00:00:00.000Z",
      "ok": true,
      "status": 200,
      "title": "Example Cafe",
      "description": "Neighborhood cafe in Bugis",
      "snippet": "Visible page text..."
    }
  ],
  "collection_notes": [
    "Official website and Instagram were checked.",
    "Google Maps rating was unavailable."
  ]
}
```

## Source Kinds

Use these `kind` values where possible:

- `website`
- `google_maps`
- `instagram`
- `facebook`
- `tiktok`
- `xiaohongshu`
- `delivery_platform`
- `reservation_platform`
- `search_result`
- `competitor_profile`
- `trade_area`
- `review_source`

## Required Source Fields

Each source should include:

- `kind`
- `collector_id`
- `observed_at`
- `url` or `submitted_url`
- `ok`
- `title`, `description`, or `snippet` when available

Use `error`, `blocked_reason`, or `status` to explain failures.

## Submission

Submit external evidence as `external_evidence` in `POST /v1/brand-intelligence-evidence`.

```json
{
  "brand_name": "Example Cafe",
  "market": "Singapore, Bugis",
  "category": "Restaurant / F&B",
  "contact_name": "Owner",
  "email": "owner@example.com",
  "report_tier": "advanced",
  "external_evidence": {
    "schema_version": "amc.brand_intelligence.evidence.v1",
    "collected_at": "2026-07-16T00:00:00.000Z",
    "public_sources": [],
    "collection_notes": []
  }
}
```

`amc-growth` will merge external sources with its internal collectors and persist the combined evidence package.

The response includes `evidence_path`. Generate reports in a second call:

```json
{
  "evidence_path": "intelligence/brand-intelligence-intake/evidence/example-cafe-singapore/2026-07-16-...-evidence.json",
  "report_tier": "advanced"
}
```

Send that payload to `POST /v1/brand-intelligence-reports`.

`POST /v1/brand-intelligence-intake` is still supported as a one-step compatibility endpoint.
