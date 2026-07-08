# Walkthrough - BD Role and Access Control

This walkthrough summarizes the changes made to add the BD (Business Development) role to `amc-kanban` user management and restrict access to the BD panel in `amc-mm` to only users with the BD role.

## Changes Made

### 1. amc-kanban (Admin Console & User Roster)

- **`UserAccountsPanel.tsx`**: Added the `BD` checkbox in the inline user editor, rendered the yellow `BD` badge, and updated type signatures.
- **`UserGroupsPanel.tsx`**: Added the "商务拓展组 (Business Development - BD)" pre-defined user group, and updated the selected group ID states and dropdowns.
- **`UsersTab.tsx`**: Aligned type annotations for `UserRecord` and prop types to support `'BD'`.
- **`page.tsx` (Admin dashboard)**: Aligned the toggle function signature and added `.admin-badge-amber` and `.dark .admin-badge-amber` styles for the yellow badge.

### 2. amc-mm (Mobile Merchant App)

- **`BrandOwnerDashboard.tsx`**: Restricted `isBdUser` check strictly to users having the `'BD'` role. System administrators without the `'BD'` role will no longer have access to the BD swipe gesture. Additionally, updated mount-hydration logic and profile-loading to automatically toggle off BD mode if the active user does not have the `'BD'` role.

## Verification

### 1. Build Verification
- Ran TypeScript compile checks on both codebases:
  - `amc-kanban`: `npm run typecheck` passed successfully.
  - `amc-mm`: `npm run typecheck` passed successfully.

### 2. Manual Test Guidance
- Log in to the `/admin` portal on `amc-kanban` to verify the new "BD" group under the Groups tab, and the BD checkbox and yellow badge in the Accounts list.
- On `amc-mm`, verify that only users with the `BD` role can swipe to enter the BD Workbench/revenue dashboard. Users without the role (including simple admins without BD role) will no longer see or enter BD mode.
