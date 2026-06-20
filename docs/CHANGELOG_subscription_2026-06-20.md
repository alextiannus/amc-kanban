# 订阅计划调整 — 2026-06-20

给 programmer 的变更通知，本次改动已写入代码和文档，**尚未部署**（需要 commit + push + Render 重新构建）。

## 改了什么

### 1. `src/lib/subscription/catalog.ts`
- **Tier 1 (`starter`)**：文案微调 —「30条」→「30-36条」图文；「建立素材库」→「建立品牌营销素材库」；「账号运营月报」→「账号运营数据分析报表」；博主探店「4位」→「不少于4位」，「手机拍摄」→「素材拍摄」。仅文案，不影响计价逻辑。
- **Tier 2 (`essential`)**：`monthlyUsd` 从 1800 改为 **3600**，新增 `promoMonthlyUsd: 2400`（当前用促销价结算，`calculatePricing()` 已经支持 `promoMonthlyUsd` 优先取值，不用动逻辑）。
- **Tier 3 (`advanced`)**：新增 `visible?: boolean` 字段，`advanced.visible = false`。**软下架**，不是删除：
  - `SubscriptionPlan` 类型新增了 `visible?` 字段。
  - 按 id 查找（`SUBSCRIPTION_PLANS.find(...)`）、checkout 校验、admin 手动设置（`admin/page.tsx` 里的下拉框）都不受影响，照常能用。
  - 唯一改动点是 `src/app/api/subscription/route.ts` 的两处 GET 响应，把 `plans: SUBSCRIPTION_PLANS` 改成了 `plans: SUBSCRIPTION_PLANS.filter(p => p.visible !== false)` —— 新签约页面（`SubscriptionClient.tsx`）只会拿到 starter/essential 两个选项，因为它本来就是 `data.plans.map(...)` 动态渲染，没有硬编码三档，不用改前端。
  - 顺手修了一处历史遗留 bug：`advanced.includes` 数组里有一行写死的英文残留文本（"...of the merchant"），已清掉。

### 2. `src/lib/subscription/terms.ts`（合同条款全文）
- 新增「服务暂停」条款（提前30天书面通知，限1次，不超60天），原来的合同终止/争议解决/一般条款章节号顺延（十一→十二、十二→十三、十三→十四）。
- 续约条款补充「STARTER 套餐年框续签享优先续约价」。
- 一般条款里补了「中英双语服务」「PSG 补贴需商家自行通过 GoBusiness 提交，服务方协助提供文件」两条，之前文本里没有。
- 服务套餐条款（第二条）从「STARTER、ESSENTIAL、ADVANCED」改为「STARTER、ESSENTIAL + 加购服务包」，呼应 Tier 3 软下架。

### 3. `docs/amc-subscription-plan`（产品文案源文件，非代码）
- 同步了上面 Tier1/Tier2 的文案与价格改动。
- Tier 3 标题改为「Bak · 其他可加购内容（原 Tier 3 · 流量扩张版，软下架，拆解为加购包）」，并标注定价待定。
- 顺手修了一个已存在的错字：「AI 私运营官」→「AI 私域运营官」。
- 补了文末的中英双语/PSG 条款说明（原文件缺失，但用户最新文案里有）。

## 还没做、需要你后续跟进

1. **「Bak」加购包还没有定价，没有加进 `SUBSCRIPTION_ADDONS`。** 内容是：付费广告投放管理、头部 KOL 合作管理、私域社群运营、转化追踪报告。等产品侧给出拆分定价后，需要在 `catalog.ts` 的 `SUBSCRIPTION_ADDONS` 数组里新增对应条目（参考现有 `influencer_visit` / `dianping_ops` 的写法），同时 `calculatePricing()` 不需要改，addon 定价机制已经支持 monthly/one_time 两种。
2. **`tsc --noEmit` 已过一遍**，排除 `.next` 缓存的历史噪音后没有新报错，但没跑过 `npm run build` / 实际打开页面验证 Stripe checkout 流程（尤其是 Tier2 涨价后 `calculatePricing` 算出来的金额、以及 `promoMonthlyUsd` 在 12 个月折扣叠加时的最终金额），建议部署前手动走一遍 checkout。
3. **现有 Tier 3 (advanced) 订阅商家不受影响**，但如果后台/客服流程里有任何地方是按「三档套餐」写的硬编码文案（不是从 `SUBSCRIPTION_PLANS` 动态取的），需要自查一下，目前只确认了 `SubscriptionClient.tsx` 和 `admin/page.tsx` 两处，没有逐个翻遍全部页面。
4. 本次没有改 `src/lib/partner/mcp/server.ts`、`src/app/learn/page.tsx`、`src/app/api/brands/[id]/subscription/route.ts` 里出现的 `advanced` 引用 —— 这几处是只读展示/历史数据相关，评估后认为不需要跟着这次价格调整改，但如果你发现哪里读取的是写死的旧价格（1800 / 不展示促销价），需要单独修。
