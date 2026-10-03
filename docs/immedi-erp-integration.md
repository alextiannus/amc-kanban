# ImmediToday synchronization

Implemented application contract. Verify release using the deployed commit and native source receipts.

Paid non-waived subscriptions (including existing unsynchronized purchases) and durable brand service orders are delivered by the existing minute worker. Per the user-approved rule, ACTIVE + feeWaived=false + positive value is authoritative payment confirmation. A separate paidAt timestamp or second Finance confirmation is not required. Stripe checkout completion without payment is ignored. Persist the confirmed payment basis with the native order, without inventing a bank account or payment timestamp.

A source snapshot captures real customer contact, currency, discounted service lines, contract dates, payment reference and the exactly mapped current human principal. Persist it before dispatch and reuse it on uncertain retries. Missing or ambiguous principals are actionable failures. The existing SystemConfig stores credentials, SKU and employee mappings; no credentials move to browser or environment variables.

Brand service orders use the existing AMC service catalog, server pricing, brand authorization and subscription.manage capability. GET/POST /api/brands/:id/orders exposes order status and submission. Stable request IDs prevent duplicate purchases. Background delivery, not browser waiting, supplies ERP receipts.

品牌归属同步与个人奖励分开核验：Project/ToDo 仅表示当前负责人，月度奖励及奖池由独立后台接口 /external/v1/amc-monthly-rewards 处理。按合同生效月份的次月起算，最多计算至当前月份及合同结束月份。每个收费 ACTIVE subscription 每月计提 SGD70，按订阅和月份唯一入池；个人奖励每品牌每月仅一次。Booster 每品牌每月新加坡员工 SGD700、中国员工 CNY3500；员工所在地缺失或币种无标准时明确待处理。Essential 人民币标准已于 2026-10-03 确认：每位主理人每月符合条件的 Essential 品牌按合同生效时间及品牌 ID 排序，前 4 个各 RMB150/月，第 5 个起各 RMB300/月；不计入 Booster 品牌，不将前 4 个追溯提升为 300。仍从 plan 生效次月起算；SGD 等其他币种的 Essential 标准仍待确认，不按汇率猜测，不沿用已停用规则。主理人固定奖励独立于 AMC 奖池，不扣减奖池；仅奖池实际发放扣减年度余额。历史已发放奖励保留，差额单独核对。用户于 2026-10-03 确认排除的 32 条缺少品牌关联的历史订阅，以 immediIgnoredSubscriptions.ts 中的固定清单为准：不录入 ERP、不计提奖励或奖池、不重试、不列为待补齐项；保留原始订阅，并审计标记空同步回执为 IGNORED。已有订单编号或发送快照的回执不得覆盖。清单以外的新缺失品牌记录、缺失生效日期仍需明确处理，不猜测。品牌订单页分别展示归属状态及本品牌月度奖励结果，不泄露其他品牌或员工金额。

Deploy ImmediToday first, then AMC with prisma migrate deploy. Enable only the existing database integration using a scoped external key. Validate native receipts and production versions, without fabricated business transactions.

Validation: `npm run test:immedi-erp`, `npm run test:subscription`, `npm run typecheck`, `npm run verify:auth-routes`, `npm run docs:api:check`, and `npm run build`. For the real PostgreSQL route test, create an isolated database named amc_orders_route_test, apply the schema with prisma db push, then run scripts/test-amc-orders-route.mts using node --import tsx and that DATABASE_URL. It verifies authorization, cross-origin writes, concurrent replay, server pricing, immutable sales ownership and queue status without contacting ERP.
