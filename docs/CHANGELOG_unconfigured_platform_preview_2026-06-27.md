# CHANGELOG: Unconfigured Platform Preview & AI Write Selection Fix

**Date**: 2026-06-27  
**Status**: Completed & Verified  

---

## 1. Overview
When creating a new post from the publish calendar, selecting an unconfigured social platform (e.g., "小红书 (未配置)") and clicking **✨ AI 创作** resulted in:
1. The platform's preview card immediately disappearing from the preview panel.
2. The platform's selection button in the editor resetting to an unselected state.

This occurred because when the AI copywriting draft is saved, a database-level placeholder `SocialAccount` (with `handle: 'unconfigured'`) is generated for that platform. The frontend updated `selectedAccountIds` from `'unconfigured_red'` to the real database ID (e.g., `'clxxx123'`), but `accountOptions` (which controls which accounts are valid for select/preview) still only contained `'unconfigured_red'`. Consequently, the UI could not find the account by its new ID, leading to the selection and preview panel items disappearing.

---

## 2. Solution Details
In [DashboardCalendar.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/DashboardCalendar.tsx):
- Updated the `accountOptions` computation to check if `createdDrafts` contains drafts for unconfigured accounts.
- If so, it dynamically swaps out the hardcoded placeholder ID (e.g., `'unconfigured_red'`) with the actual database ID of the created placeholder account.
- Changed the duplicate check checks (`hasGoogle`, `hasRednote`, etc.) to use `list.some` instead of `accounts.some` to properly account for the dynamically added unconfigured drafts and prevent double-pushing.
- Appended `createdDrafts` to the `useMemo` dependency array so the selection UI and preview panels update immediately when drafts are initialized/updated.

---

## 3. Verification
- TypeScript compilation checked with `npx tsc --noEmit` and passed successfully.
