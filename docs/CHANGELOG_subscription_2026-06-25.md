# Changelog - Subscription Pricing Update (2026-06-25)

## 1. Tier 2 · 品牌建设版套餐内容与费率更新
- **修改详情**：
  - 将订阅计划中“品牌建设版 (essential)”的价格从之前配置的 **3600 USD/月** 调整为 **2800 USD/月**。
  - 将套餐名称从 `'品牌建设版'` 更改为 `'Tier 2 · 品牌建设版'`。
  - 更新覆盖平台，移除了“大众点评”，聚焦于 Google Maps、Facebook、Instagram、TikTok、小红书。
  - 更新博主探店配额：由“每季度安排 24 位博主探店（含大博主）”调整为“每月最多可安排 30 位博主探店（看店家需求）”。
  - 精简并规范化了服务描述与明细。
- **影响范围**：
  - 更新了系统底层计价配置文件 `src/lib/subscription/catalog.ts` 中的 `SUBSCRIPTION_PLANS` 属性及 `PLAN_COMPARISON_ROWS`。
  - 更新了相关文档：
    - `docs/testplan.md`：调整了测试用例 TC-SUB-001 中的价格校验点（3600 -> 2800）。
    - `docs/amc-subscription-plan`：同步更新了此纯文本产品说明书。

## 2. 自动化测试用例调整
- **测试脚本**：`scripts/test-subscription-pricing.mts`
- **校验公式更新**：
  - 12个月订阅总价（含每月 220 增值服务，10%折扣，一次性 200 拍摄服务）：
    `(2800 + 220) * 12 * 0.9 + 200 = 32816 USD` (原为 41456 USD)。
  - 更新后运行 `npx tsx scripts/test-subscription-pricing.mts` 校验全部通过。
