---
name: brand-intelligence-intake
description: "Collect public evidence for AMC Brand Intelligence Intake and generate local lifestyle merchant network-operation reports. Use when researching a local merchant brand, gathering website/Google Maps/social/trade-area/competitor evidence, normalizing evidence for amc-growth, submitting external AI-agent evidence back to amc-growth, or producing initial and advanced Brand Intelligence Intake reports."
---

# Brand Intelligence Intake

## Core Rule

Collect evidence first, then write reports. Do not infer ratings, review counts, hours, platform handles, competitor performance, or social activity unless the evidence package contains the value. Use `暂无数据` for every unavailable field.

Do not mention internal PSG logic to customers. Frame all outputs around creating value for local lifestyle merchants: discoverability, trust, content operations, conversion paths, trade-area context, and competitor awareness.

## Workflow

1. Build the intake payload with the merchant's brand name, market, category, contact name, report email, and any optional public links.
2. Collect evidence using the available collector modules.
3. Normalize all results to the AMC evidence contract.
4. Submit the payload and evidence to `amc-growth` as a saved evidence package.
5. Generate the initial or advanced report from the saved `evidence_path`.
6. Store the intake, evidence package, report markdown, and latest JSON manifest.

## What To Load

- For the evidence JSON contract and API/CLI submission examples, read `references/evidence-contract.md`.
- For the pluggable collector architecture and provider selection rules, read `references/collector-modules.md`.
- For the initial and advanced report requirements, read `references/report-logic.md`.

## Minimum Intake Fields

Required:

- `brand_name`
- `market`
- `category`
- `contact_name`
- `email`

Optional but useful:

- `website_url`
- `google_maps_url`
- `instagram_url`
- `facebook_url`
- `tiktok_url`
- `xiaohongshu_url`
- `other_links`
- `main_concern`
- `report_tier`: `initial`, `advanced`, or `both`
- `external_evidence`: evidence collected outside AMC

## Data Quality Rules

- Prefer official website, Google Business Profile/Maps, official social accounts, platform profiles, delivery/reservation listings, public photos, and visible customer reviews.
- Keep source URLs and collection timestamps.
- Mark blocked, unavailable, rate-limited, or unverified sources explicitly.
- Keep submitted merchant claims separate from independently collected public evidence.
- Store competitor candidates as candidates until evidence confirms relevance.
- For social media, distinguish account existence from account ownership and recent activity.

## Submitting To AMC Growth

Use the local CLI when inside the repo. The preferred two-step flow is:

```bash
npm run intake:brand -- --save-evidence-only --brand-name "Brand" --market "Singapore, Bugis" --category "Restaurant / F&B" --contact-name "Owner" --email "owner@example.com" --evidence-file ./evidence.json
npm run intake:brand -- --generate-reports --evidence-path intelligence/brand-intelligence-intake/evidence/<brand-key>/<file>.json --report-tier advanced
```

Use the compatibility one-step flow when a caller needs intake, evidence and reports in one request:

```bash
npm run intake:brand -- --brand-name "Brand" --market "Singapore, Bugis" --category "Restaurant / F&B" --contact-name "Owner" --email "owner@example.com" --report-tier advanced --evidence-file ./evidence.json
```

Use the API when running as an external Agent:

```http
POST /v1/brand-intelligence-evidence
Authorization: Bearer <AMC_GROWTH_TOKEN>
Content-Type: application/json
```

Then generate reports from the returned `evidence_path`:

```http
POST /v1/brand-intelligence-reports
Authorization: Bearer <AMC_GROWTH_TOKEN>
Content-Type: application/json
```

Send `{ "evidence_path": "...", "report_tier": "advanced" }`.

`POST /v1/brand-intelligence-intake` remains available as a compatibility one-step endpoint.

## Report Selection

- `initial`: Generate `本地生活商家品牌网络运营评估`.
- `advanced` or `deep`: Generate the initial report plus `本地生活商家品牌网络运营深度评估报告和提升建议`.
- `both`: Same as `advanced`.

Within 60 days, an initial report for the same brand/email is reused unless `force_refresh` is true. Advanced report requests generate a fresh advanced output because they need the deeper template.
