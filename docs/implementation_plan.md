# Implementation Plan - Add BD Role to User Management

This plan outlines the changes needed to support the BD (Business Development / 商务拓展) business role in the `amc-kanban` admin panel.

## Proposed Changes

### User Management Console

We will update the admin dashboard components and page styles to include the `BD` role, enabling administrators to view, toggle, and group users by this role.

---

#### [MODIFY] [UserAccountsPanel.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/admin/UserAccountsPanel.tsx)

- Update `UserAccountsPanelProps` type signature for `onToggleBusinessRole` to accept `'BD'`.
- Update `toggleDraftBusinessRole` to accept `'BD'`.
- Render a yellow badge (`admin-badge-amber`) for users with the `'BD'` role.
- Add a checkbox for `'BD'` in the in-place user editor:
  ```tsx
  <label className="admin-check">
    <input
      type="checkbox"
      checked={draft.businessRoles.includes('BD')}
      onChange={() => toggleDraftBusinessRole('BD')}
    />
    <span>BD</span>
  </label>
  ```

---

#### [MODIFY] [UserGroupsPanel.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/admin/UserGroupsPanel.tsx)

- Update `UserGroupsPanelProps` type signature for `onToggleBusinessRole` to accept `'BD'`.
- Update `GroupDef` types to allow `'BD'` as a `businessRole` and `'bd'` as an `id`.
- Add the BD Group definition to `GROUPS`:
  ```typescript
  {
    id: 'bd',
    name: '商务拓展组 (Business Development - BD)',
    description: '负责对接商户、协助商户入驻和跟进服务的商务发展角色。',
    roleType: 'business',
    businessRole: 'BD'
  }
  ```
- Update `selectedGroupId` state type to support `'bd'`.

---

#### [MODIFY] [UsersTab.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/admin/UsersTab.tsx)

- Update type annotations in `UserRecord` and `UsersTabProps` to include `'BD'`.

---

#### [MODIFY] [page.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/admin/page.tsx)

- Update type signature of `toggleBusinessRole` to accept `'BD'`.
- Add `.admin-badge-amber` and `.dark .admin-badge-amber` styles to the admin console:
  ```css
  .admin-badge-amber {
    border-color: rgb(253 230 138);
    background: rgb(254 243 199);
    color: rgb(180 83 9);
  }
  .dark .admin-badge-amber {
    background: rgb(15 23 42);
    border-color: rgb(51 65 85);
    color: rgb(203 213 225);
  }
  ```

## Verification Plan

### Automated Verification
- Run `npm run build` or `next build` (or `tsc --noEmit`) to verify that no TypeScript or build errors are introduced by the type signature changes.

### Manual Verification
1. Access the `/admin` page under "用户管理" (User Management).
2. Verify that the "商务拓展组 (Business Development - BD)" group shows up in the "用户组与角色" (User Groups & Roles) tab, and that users can be added to/removed from it.
3. Verify that under the "账号管理" (Account Management) list, users with the `BD` role display a yellow `BD` badge.
4. Edit a user and check/uncheck the "BD" role checkbox, and save. Verify the update persists.
