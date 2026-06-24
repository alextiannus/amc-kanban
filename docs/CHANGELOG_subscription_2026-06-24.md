# Changelog - Subscription Pricing Update (2026-06-24)

## 1. 品牌建设版 (`essential`) 费率更正与拍摄服务价格调整
- **修改详情**：
  - 将订阅计划中“品牌建设版 (essential)”的价格从之前配置的 **2800 USD/月** 更正为 **3600 USD/月**。
  - 将“专业到店内容拍摄 (onsite_photo)”的单次增值价格从 **380 USD/次** 调整为 **200 USD/次**。
  - 在“专业到店内容拍摄”描述和详情中明确指出该服务包括“新品拍摄”等专业服务。
- **影响范围**：
  - 更新了系统底层计价配置文件 `src/lib/subscription/catalog.ts` 中的 `onsite_photo` 属性。
  - 更新了测试文档 `docs/testplan.md`。

## 2. 自动化测试用例调整
- **测试脚本**：`scripts/test-subscription-pricing.mts`
- **校验公式更新**：
  - 12个月订阅总价（含每月220增值服务，10%折扣，一次性200拍摄服务）：
    `// (3600 + 220) * 12 * 0.9 + 200 = 41456 USD` (原为 41636 USD)。
  - 更新后运行 `npm run test:subscription`，所有计价计算与增值服务扣减逻辑校验通过。
