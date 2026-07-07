# Implementation Plan — Fix Middleware Routing and Login Reload Issue

This plan addresses the issue where the login page fails to load properly on reload by correctly renaming the middleware file to `src/middleware.ts` and whitelisting static assets (like `manifest.json`, `sw.js`, images, etc.) from the authentication guard.

## Proposed Changes

### 1. Middleware Refinement and Activation

#### [NEW] [middleware.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/middleware.ts)
- Rename `src/proxy.ts` to `src/middleware.ts` (Next.js middleware entrypoint).
- Update the public route checking logic to whitelist:
  - PWA manifest files: `/manifest.json`, `/manifest.webmanifest`
  - PWA service worker and workbox scripts: `/sw.js`, `/workbox-*.js`
  - Icons and design assets: `/icons/*`, `/images/*`, `/logos/*`, `/favicon.ico`
  - UGC and watermarked uploads: `/uploads/*`, `/snapshots/*`
- Maintain existing public pages: `/terms`, `/privacy`, `/game`, `/reset-password/*`, `/invite/*`.

#### [DELETE] [proxy.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/proxy.ts)
- Delete `src/proxy.ts` after renaming it to `src/middleware.ts`.

---

## Verification Plan

### Automated Checks
- Run `npm run typecheck` to ensure type safety.

### Manual Verification
1. Run local development server.
2. Visit `/board` unauthenticated -> verify it immediately redirects to `/` on the server-side.
3. Access `/manifest.json` unauthenticated -> verify it returns JSON rather than redirecting to `/` (HTML).
4. Verify that `/privacy` and `/terms` routes can be accessed unauthenticated.
5. Log in -> verify it redirects to `/board`.
6. Access `/` while logged in -> verify it redirects to `/board`.
