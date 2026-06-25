# CHANGELOG - AMC Publish Calendar Postiz-app Alignment (2026-06-25)

We have adjusted the publishing calendar view on both the design level (in Stitch) and the implementation level (in the Next.js codebase) to incorporate high-value multi-channel UX and operational features inspired by Postiz-app.

---

## 1. Summary of Changes

### A. Calendar API Mapping Enhancement
- **File**: `src/app/api/dashboard/calendar/route.ts`
- Queries and maps draft `mediaUrls` to `MediaAsset` records, exposing `mediaAssetId` in the calendar events.

### B. High-Fidelity Calendar View & AI Agents Integrations
- **File**: `src/components/dashboard/DashboardCalendar.tsx`
- Restructured into a **three-column layout**: left channel sidebar, central grid, and right-side Day Details Drawer.
- **Left Sidebar**: Renders active brand social accounts and private domain marketing feeds (Email Newsletter, WhatsApp Broadcast). Includes simulated flow for the **"AI 一键排期提案"** button.
- **Active Filters**: Adds tabs (`全部`, `待审核`, `已排期`, `已发布`) to dynamically filter the calendar grid and drawer cards.
- **Day Details Drawer**:
  - Exposes **AI Writer (AI 创作重构)** action.
  - Exposes **AI Designer (AI 修图)** and **AI Video (Veo3)** prompt panel, letting users input natural language commands to automatically edit images and update drafts in the database in real-time.
  - Displays Dub.co click and ROI tags for published cards, and Temporal retry status for scheduled posts.

### C. Brand Owner Portal Calendar Cleanup
- **File**: [BrandOwnerDashboard.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/BrandOwnerDashboard.tsx)
- Replaced the hardcoded monthly grid (static 30 days and dot indicators) with dynamic calendar rendering.
- Computes month bounds (first day offset, total days) to build a correct calendar grid dynamically.
- Interrogates local drafts to show green dot schedule indicators only on dates with active posts in the database.
- Transitioned `selectedDay` to a full `Date` object to prevent month-crossing comparison errors.
- Updates "Scheduled Posts This Month" feed to dynamically filter drafts for the current calendar month and year.
- Filters Weekly Planner action feed items to display only drafts scheduled for the user's selected day, removing static placeholder posts.

---

## 2. Verification

- **TypeScript Compilation**:
  ```bash
  npx tsc --noEmit --skipLibCheck
  ```
  **Result**: `Passed successfully.`

- **Integration Tests**:
  ```bash
  node --experimental-strip-types scripts/test-v2-flow.mts
  ```
  **Result**: `🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉`
