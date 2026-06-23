# 订阅计划价格调整 — 2026-06-23

根据最新运营要求，更正订阅套餐月费：

1. **Tier 1 (自媒体基础运营 `starter`)**：月费更正为 **600 USD** (从 800 USD 降至 600 USD)。
2. **Tier 2 (品牌建设版 `essential`)**：月费更正为 **2800 USD** (从 3600 USD 且带有 2400 USD 促销价，改为干净的无促销价 2800 USD)。

## 影响范围及文件更改

### 1. `src/lib/subscription/catalog.ts`
- 更新 `SUBSCRIPTION_PLANS` 对应的 pricing 数值。
- 将 `starter` 的 `monthlyUsd` 设为 `600`。
- 将 `essential` 的 `monthlyUsd` 设为 `2800` 并彻底移除了 `promoMonthlyUsd` (原为 2400)。

### 2. `scripts/test-subscription-pricing.mts`
修改计价断言，使其符合新的价格基础（600 USD Starter 与 2800 USD Essential）：
- `starter3` 3个月订阅总价：`600 * 3 = 1800 USD` (原为 2400 USD)。
- `essential12` 12个月订阅总价 (含每月220增值服务，10%折扣，一次性380拍摄服务)：`(2800 + 220) * 12 * 0.9 + 380 = 32996 USD` (原为 22196 USD)。
- `deduped` 去重计价：`(600 + 220) * 3 = 2460 USD` (原为 3060 USD)。

### 3. `docs/amc-subscription-plan`
- 同步文档中展示的价格文案，更新为 S$600 与 S$2,800。
