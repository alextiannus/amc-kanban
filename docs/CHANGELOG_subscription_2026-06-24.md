# Changelog - Subscription Pricing Update (2026-06-24)

## 1. 品牌建设版 (`essential`) 费率更正
- **修改详情**：应用户要求，将订阅计划中“品牌建设版 (essential)”的价格从之前配置的 **2800 USD/月** 更正为 **3600 USD/月**。
- **影响范围**：
  - 更新了系统底层计价配置文件 `src/lib/subscription/catalog.ts`。
  - 更新了展示文档 `docs/amc-subscription-plan`。
  - 更新了测试文档 `docs/testplan.md`。

## 2. 自动化测试用例调整
- **测试脚本**：`scripts/test-subscription-pricing.mts`
- **校验公式更新**：
  - 12个月订阅总价（含每月220增值服务，10%折扣，一次性380拍摄服务）：
    `// (3600 + 220) * 12 * 0.9 + 380 = 41636 USD` (原为 32996 USD)。
  - 更新后运行 `npm run test:subscription`，所有计价计算与增值服务扣减逻辑校验通过。
