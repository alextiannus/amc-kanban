# AMC Dashboard

AMC Dashboard is the UI and governance layer for Human-AI collaboration. The platform focuses on Kanban execution, permission control, auditability, and agent lifecycle management.

![AMC Dashboard Logo](public/amc-dashboard-logo-horizontal.svg)

## Brand Update

- Old display name: AMC Command Center
- New display name: AMC Dashboard
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

## Notes

- Dify remains the workflow and knowledge-base center (Dify-first).
- AMC Dashboard focuses on UI, permission boundaries, integration, and observability.
