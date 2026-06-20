# AMC Login Experience & Registration Simplification — 2026-06-20

A summary of changes made to the user onboarding and login screen experience.

---

## Changes Implemented

### 1. Simplified Onboarding (Registration Flow)
* **API Route Modified**: [register/route.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/api/auth/register/route.ts)
  * Relaxed the schema requirements: Made `nickname`, `country`, and `phone` optional fields during register.
  * Added fallback behavior:
    * `nickname` defaults to the username prefix of the email address (e.g., `user@domain.com` → `user`).
    * `country` defaults to `null` (and defaults to `'US'` inside the AI Agent auto-assignment resolver block).
    * `phone` defaults to `null`.
* **Login Component Modified**: [page.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/page.tsx)
  * Completely removed registration form inputs for `Nickname`, `Country`, and `Contact Phone` to minimize sign-up friction. Only **Email**, **Password**, and **Confirm Password** are now required to create an account.
  * Extra merchant parameters (e.g. location details) are deferred to be collected when creating a brand.

### 2. Premium Light Theme Conversion
* **CSS Modified**: [globals.css](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/globals.css)
  * Adjusted custom scrollbars (`terminal-scrollbar`) to fit light backgrounds seamlessly.
  * Tuned `obsidian-card` class definitions for clean white glassmorphism borders and high-opacity backdrop-blurs.
  * Reconfigured radial glows (`aurora-glow-1`, `aurora-glow-2`) to use soft, low-opacity gradients suited for bright backdrops.
* **Login Page Component Modified**: [page.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/page.tsx)
  * Updated background container styles to a warm light gradient `bg-[#F8FAFC]`.
  * Reworked Left-side **Autopilot Console**:
    * Clean Slate font sizes and header alignments.
    * Transparent white feed cards with soft shadows and readable dark text (`text-slate-800`).
    * Sparkle badges with a clean light emerald theme (`bg-emerald-50 text-emerald-700`).
    * Transformed the macOS terminal window container to feature a light gray theme (`bg-slate-50/80` background, `bg-slate-200/40` header bar, and dark slate monospace font logs).
    * Log type highlights (e.g., REFRESH, PUBLISH, INSIGHTS) are rendered using high-contrast, readable light colors.
  * Reworked Right-side **Login Form**:
    * Input styles updated to soft white-gray (`bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400`).
    * Obsidian layout cards and tab navigation changed to clean light mode outlines.
    * Submit button configured with a rich gradient shadow that integrates smoothly with the light layout.

---

## Verification Status
* **Compilation**: `npm run build` compiled successfully with zero type errors or layout validation blocks.
* **E2E Playwright Tests**: `node scratch/test-extension-e2e.mjs` completed successfully. Authenticators, API calls, and mock platform integrations are fully verified.
