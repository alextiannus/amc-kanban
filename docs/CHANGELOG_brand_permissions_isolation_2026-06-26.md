# 品牌列表权限隔离与不属于主理人品牌隐藏变更记录 (Brand Permissions Isolation & Unassigned Brand Visibility Fix)

**更新时间**：2026-06-26
**描述**：修复了“我的品牌”列表中泄漏展示同组织下未授权/分配给当前协调员/主理人的其他品牌的 Bug。

---

## 变更设计与决策 (Design Decisions)

### 1. 明确“归属品牌”的界定标准
- **之前逻辑**：如果用户属于某个组织，则该组织 Owner 名下的所有品牌均会被自动视为当前用户“负责”的品牌。这导致组织成员能够看到和管理未指派给他们的所有品牌，不符合隔离要求。
- **优化后逻辑**：
  - 针对拉取当前用户负责的品牌（即 `assignedOnly === true`）：
    - 仅保留**直属拥有者（BrandOwner）**、**Legacy 拥有者（ownerId）** 以及**有 Agent 管理权限（AgentPermission 关联 BrandAgent）** 这三种直接归属。
    - **完全移除了单纯通过组织成员身份自动获取所有品牌**的宽泛规则。
  - **效果**：组织 Owner 依然能基于拥有权查看名下所有品牌，而组织下的普通协调员/主理人将只能看到分配给他们管理的品牌，实现了精准的权限隔离。

---

## 修改文件列表 (Modified Files)

### 1. 后端接口路由
- **[route.ts](file:///Users/alextian/Documents/Claude/Projects/AI%2520Staff/amc-kanban/src/app/api/brands/route.ts)**:
  - 移除了 `assignedOnly === true` 中关于 `organizationMember` 条件的 OR 查询。

### 2. 前端请求路径更新
我们将前端侧边栏及其他用户端用于展示“我的品牌”列表的 API 调用，全部规范为 `/api/brands?assignedOnly=true`。
- **[BrandOwnerDashboard.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%2520Staff/amc-kanban/src/components/dashboard/BrandOwnerDashboard.tsx)**:
  - 将初始化拉取品牌的 fetch 路径由 `/api/brands` 修改为 `/api/brands?assignedOnly=true`。
- **[useBrand.ts](file:///Users/alextian/Documents/Claude/Projects/AI%2520Staff/amc-kanban/src/hooks/useBrand.ts)**:
  - 将 `useBrandList` 中的接口请求由 `/api/brands` 修改为 `/api/brands?assignedOnly=true`。
- **[page.tsx (Poster Page)](file:///Users/alextian/Documents/Claude/Projects/AI%2520Staff/amc-kanban/src/app/board/game/poster/%5BbrandId%5D/page.tsx)**:
  - 将获取品牌列表的请求由 `/api/brands` 修改为 `/api/brands?assignedOnly=true`。
- **[page.tsx (Mock Merchant)](file:///Users/alextian/Documents/Claude/Projects/AI%2520Staff/amc-kanban/src/app/mock-merchant/page.tsx)**:
  - 将品牌列表请求更新为 `/api/brands?assignedOnly=true`。
- **[page.tsx (Mock Merchant Platform)](file:///Users/alextian/Documents/Claude/Projects/AI%2520Staff/amc-kanban/src/app/mock-merchant/%5Bplatform%5D/page.tsx)**:
  - 将品牌列表请求更新为 `/api/brands?assignedOnly=true`。

---

## 测试与校验 (Verification)
- 编写并执行了多租户和组织成员隔离的自动化 Prisma 集成测试脚本 `scripts/test-brand-isolation.mts`，确认组织所有者可以看到全部品牌，而组织成员仅能看到其被授权管理/指派的特定品牌，测试通过。
- 运行 `npx tsc --noEmit` 和 `npm run build`，编译构建 100% 通过。
