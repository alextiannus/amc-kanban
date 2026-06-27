# CHANGELOG - Brand Owner Portal Logout and Redirection Fixes

**Date**: 2026-06-27

---

## 1. Context & Objectives

To resolve issues in the brand owner portal (`amc-mm`) where:
- Users were unable to log out successfully because session cookies were scoped to the parent domain (`localhost` or `immedi.ai`) and not cleared by subdomain actions.
- Logging in or routing to protected paths resulted in local port leakage (browser redirected to downstream port `localhost:3001`), which mismatched the session cookie domain and broke brand loading.

---

## 2. Implementations

### A. Multi-Domain Cookie Clearance on Logout
- **File Modified**: [route.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/api/auth/logout/route.ts)
- **Changes**:
  - Replaced Next.js key-based `cookies().delete()` with raw `NextResponse.headers.append` calls to prevent key overwriting when clearing the same cookie across multiple domains.
  - Appended multiple `Set-Cookie` deletion headers targeting:
    - The current subdomain request host (e.g. `amc-mm.localhost`).
    - The parent domain (e.g. `localhost` or `immedi.ai`).
    - The dotted parent domain (e.g. `.localhost` or `.immedi.ai`).
  - Added parent domain resolution logic to handle local development `.localhost` suffixes correctly.

### B. Dynamically Resolved Subdomain Redirection URL
- **File Modified**: [proxy.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/packages/brand-owner/src/proxy.ts)
- **Changes**:
  - Extracted the incoming hostname and protocol dynamically using the request's `x-forwarded-host`, `host`, and `x-forwarded-proto` headers.
  - Constructed the absolute base URL (`baseUrl`) dynamically, preserving the parent proxy hostname (e.g. `amc-mm.localhost:3000` or `amc-mm.immedi.ai`).
  - Updated all internal Next.js `NextResponse.redirect` calls to use the resolved `baseUrl` instead of the downstream Next.js server's `request.url` (which contains the downstream port `3001`), preventing port leakage in the browser.
