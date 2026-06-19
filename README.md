# AI Marketing Crew Dashboard

AI Marketing Crew Dashboard is the UI and governance layer for Human-AI collaboration. The platform focuses on Kanban execution, permission control, auditability, and agent lifecycle management.

![AI Marketing Crew Dashboard Logo](public/amc-dashboard-logo-horizontal.svg)

## Brand Update

- Old display name: AMC Command Center
- New display name: AI Marketing Crew Dashboard
- Main brand logo: public/amc-dashboard-logo.svg
- Horizontal logo: public/amc-dashboard-logo-horizontal.svg

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

## Tech Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Prisma

## Key Paths

- App metadata and title: src/app/layout.tsx
- Main board header branding: src/components/KanbanBoard.tsx
- Brand logo asset: public/amc-dashboard-logo.svg
- Latest product PRD: PRD.md
- API service map: docs/API_SERVICES.md
- AMC Agent connectivity guide: docs/AGENT_CONNECTIVITY.md
- Chrome Extension installation & E2E guide: [chrome-extension/README.md](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/chrome-extension/README.md)

## Notes

- Dify remains the workflow and knowledge-base center (Dify-first).
- AI Marketing Crew Dashboard focuses on UI, permission boundaries, integration, and observability.

## OSS Production Checklist

Run this before enabling production uploads:

```bash
npm run verify:oss
```

Required environment variables:

- HUAWEI_OBS_ACCESS_KEY_ID (or OBS_ACCESS_KEY_ID)
- HUAWEI_OBS_SECRET_ACCESS_KEY (or OBS_SECRET_ACCESS_KEY)
- HUAWEI_OBS_BUCKET (or OBS_BUCKET)
- HUAWEI_OBS_ENDPOINT (or OBS_ENDPOINT)
- HUAWEI_OBS_REGION (optional, default ap-southeast-3)
- HUAWEI_OBS_PUBLIC_BASE_URL (recommended)
- FRONTEND_ORIGINS (comma-separated origins for CORS checks)
- APP_BASE_URL (optional, auto-added to CORS check list)

The verifier checks three things:

1. OSS credentials/config are present and signed upload works.
2. Uploaded object can be read through the public asset URL used by the frontend.
3. Bucket CORS allows frontend origins to read asset URLs.
