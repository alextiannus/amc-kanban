# Changelog: AMC-MM Bug Fixes & PRD Gap Closure — 2026-06-27

## 修复内容

### Bug 1 ✅ — Approve Draft 后草稿列表不刷新

**文件**: `src/components/dashboard/MMDashboard.tsx`

**问题**：用户或 AI 批准草稿（`APPROVE_DRAFT`）后，`pendingDraftIds` 状态更新了，但 `drafts[]` 列表状态没有重新 fetch，导致已批准的草稿仍在日历/列表里显示，直到刷新页面。

**修复**：
- 抽取了 `fetchDrafts(brandId?)` useCallback，集中管理草稿列表的刷新逻辑
- 在 Voice Chat onresult 处理里的 `APPROVE_DRAFT` 分支加了 `fetchDrafts()` 调用
- 在 Text Chat handleSendText 里的 `APPROVE_DRAFT` 分支加了 `fetchDrafts()` 调用
- 在草稿快捷操作卡的「批准发布」按钮点击后也加了 `fetchDrafts()`

---

### Bug 2 ✅ — 开场白未检测平台长期未发布

**文件**: `src/components/dashboard/MMDashboard.tsx`

**问题**：`/api/brands/[id]/companion/context` 返回了 `lastPublishedByPlatform` 数据，但开场白构建逻辑只使用了 `pendingActions` 和 `todayScheduled`，完全忽略了「平台超过 3 天未发布」的检测。PRD 功能 D 验收标准明确要求开场白必须提到异常平台。

**修复**：
```typescript
// 计算各平台沉默天数
const stalePlatforms: string[] = []
for (const [platform, lastISO] of Object.entries(ctx.lastPublishedByPlatform)) {
  if (!lastISO) {
    stalePlatforms.push(platform)
  } else {
    const daysSince = (now - new Date(lastISO).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince >= 3) stalePlatforms.push(`${platform}（${Math.floor(daysSince)}天未发布）`)
  }
}
```
- 开场白 prompt 加入了 `stalePlatforms` 信息
- prompt 指令改为：「如有异常平台必须提到」
- 字数限制从 30 字放宽到 35 字（允许提到多平台）

---

### 缺口 1 ✅ — 草稿审批快捷操作卡全面升级

**文件**: `src/components/dashboard/MMDashboard.tsx`

**问题**：原有卡片只在 `activeDraftId` 时显示，且按钮没有正确调用 `fetchDrafts()` 刷新列表；拒绝按钮忘记清理 `activeDraftId`；按钮文字过于简短无法直观理解。

**升级内容**：
- **触发条件扩展**：`activeDraftId || pendingDraftIds.length > 0` 均会显示卡片
- **动画**：用 `AnimatePresence` + `motion.div` 实现卡片的进出动画
- **标题**：加入状态指示器（indigo 脉冲点），有多个待审批草稿时显示数量
- **按钮文字更新**：「批准」→「批准发布」，「拒绝」→「拒绝重写」，「调时间」→「调整时间」
- **按钮布局**：改为竖向图标+文字排列（icon on top, label below）
- **批准逻辑**：从 `activeDraftId` 或 `pendingDraftIds[0]` 取第一个草稿 ID，批准后从 `pendingDraftIds` 中移除并调用 `fetchDrafts()`
- **拒绝逻辑**：补充了 `setCompanionState('idle')` 的错误处理，修复了遗漏 `setActiveDraftId(null)` 的 bug
- **调时间按钮**：自动填充输入框「把这篇推迟到明天上午10点发布」（修复原始错别字「晑」）
- **关闭按钮**：加入 X 关闭按钮，可手动关闭卡片

---

### 缺口 2（PWA）✅ — 确认已完整实现

经检查，PWA 配置已全部完成：
- `public/manifest.json` ✅
- `public/icons/icon-192.png` + `icon-512.png` + `icon-512-maskable.png` ✅
- `next.config.js` 中已集成 `@ducanh2912/next-pwa@^10.2.9` ✅（生产环境启用）
- `src/app/layout.tsx` 中 metadata.manifest 已指向 `/manifest.json` ✅
- Apple Web App 元信息已配置 ✅

PWA 安装引导 UX（PRD 7.4 中的底部横幅 + AI 伴侣提示语音）是唯一仍未实现的子项，属于 v1.1 范畴。
