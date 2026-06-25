# CHANGELOG - Brand Owner Portal UI/UX Redesign

**Date**: 2026-06-25

---

## 1. Context & Objectives

To improve the visual quality and simplification of the brand owner portal (`amc-mm.immedi.ai`):
- Redesign the login and registration page to be simpler, cleaner, and more professional.
- Move the active brand switcher dropdown from the top header to the side menu drawer, supporting brand switching if multiple brands are owned.
- Simplify the dashboard homepage by removing the resource-intensive flashing WebGL background and its face contour outline, leaving only the clean animating eyes and mouth emoji in the center.
- Redesign the notification center trigger on the homepage into a small circular badge containing only the unread count.

---

## 2. Implementations

### A. Login & Register Redesign
- **File Modified**: [page.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/dashboard/brand-owner/login/page.tsx)
- **Changes**:
  - Removed the left-hand console panel with terminal logs, preview cards, and stats.
  - Centered the form layout as a minimalist glassmorphic card on a clean, soft background with abstract gradient light glows.
  - Simplified text styles, input borders, shadows, and button transitions.

### B. Brand Switcher Relocation
- **File Modified**: [BrandOwnerDashboard.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/BrandOwnerDashboard.tsx)
- **Changes**:
  - Removed the brand selector from the top header.
  - Embedded the brand information and selector at the top of the side drawer menu.
  - Added a conditional rendering check `brands.length > 1` so the dropdown switcher is only interactive and displays a chevron when the brand owner has more than one brand.

### C. WebGL Cleanups & Animated Emoji Simplification
- **File Modified**: [BrandOwnerDashboard.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/BrandOwnerDashboard.tsx)
- **Changes**:
  - Completely removed the WebGL canvas, shaders compiling code, and rendering animation loops.
  - Placed the absolute-positioned animating emoji expressions (blinking eyes and mouths for listening, thinking, and idle states) in the center of the viewport over a clean, solid background. This reduces CPU/GPU resource usage to 0% when idle.

### D. Notification Badge Redesign
- **File Modified**: [BrandOwnerDashboard.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/BrandOwnerDashboard.tsx)
- **Changes**:
  - Replaced the wide notification button with a small 36x36px circular badge.
  - Renders only the active count of pending notifications (e.g. `2`).
  - Added a subtle pulsing animation overlay (`animate-ping`) for clean attention drawing.

---

## 3. Calendar & Operator Brand Attributions Cleanups

### A. AI Floating Ball Removal
- **File Modified**: [DashboardCalendar.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/DashboardCalendar.tsx)
- **Changes**:
  - Completely removed the flashing/pulsing absolute-positioned "AI Floating Ball" button from the bottom-right corner of the publishing calendar view. The main "AI 一键排期提案" button remains available in the left sidebar.

### B. Operator AI Attribution Brand Filtering
- **Files Modified**:
  - [route.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/api/brands/route.ts)
  - [DashboardCalendar.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/DashboardCalendar.tsx)
- **Changes**:
  - Enhanced the `GET /api/brands` API handler to support a `assignedOnly=true` search parameter for human operators (`isAmcOperator`). When enabled, it queries the `AgentPermission` and `BrandAgent` tables to resolve only the brands assigned to the operator's active AI agents.
  - Configured `DashboardCalendar.tsx` to fetch `/api/brands?assignedOnly=true`, restricting the calendar brand list to only show the operator's assigned brands and hide others.

### C. Next.js Middleware Naming Fix (Subdomain Routing Release)
- **File Renamed**: `src/proxy.ts` -> [middleware.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/middleware.ts)
- **Changes**:
  - Renamed the subdomain separation and session check code from `src/proxy.ts` to `src/middleware.ts` so Next.js matches and compiles it as the official middleware.
  - Enabled active domain redirection so that accessing `amc-mm.immedi.ai` correctly redirects users to the Brand Owner Login/Dashboard instead of rendering the operator login page on the root path `/`.

