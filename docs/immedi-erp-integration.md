# ImmediToday synchronization

Implemented application contract. Verify release using the deployed commit and native source receipts.

Paid non-waived subscriptions (including existing unsynchronized purchases) and durable brand service orders are delivered by the existing minute worker. Per the user-approved rule, ACTIVE + feeWaived=false + positive value is authoritative payment confirmation. A separate paidAt timestamp or second Finance confirmation is not required. Stripe checkout completion without payment is ignored. Persist the confirmed payment basis with the native order, without inventing a bank account or payment timestamp.

A source snapshot captures real customer contact, currency, discounted service lines, contract dates, payment reference and the exactly mapped current human principal. Persist it before dispatch and reuse it on uncertain retries. Missing or ambiguous principals are actionable failures. The existing SystemConfig stores credentials, SKU and employee mappings; no credentials move to browser or environment variables.

Brand service orders use the existing AMC service catalog, server pricing, brand authorization and subscription.manage capability. GET/POST /api/brands/:id/orders exposes order status and submission. Stable request IDs prevent duplicate purchases. Background delivery, not browser waiting, supplies ERP receipts.

Current Crew assignments synchronize to ERP Project ToDos and existing incentive reconciliation, including transfers/removals. Published payment history and original sales ownership remain unchanged. A missing ERP identity or active incentive rule remains visible as a retry error. Manual review is required for unsupported SKUs or inconsistent values.

Deploy ImmediToday first, then AMC with prisma migrate deploy. Enable only the existing database integration using a scoped external key. Validate native receipts and production versions, without fabricated business transactions.

Validation: `npm run test:immedi-erp`, `npm run test:subscription`, `npm run typecheck`, `npm run verify:auth-routes`, `npm run docs:api:check`, and `npm run build`. For the real PostgreSQL route test, create an isolated database named amc_orders_route_test, apply the schema with prisma db push, then run scripts/test-amc-orders-route.mts using node --import tsx and that DATABASE_URL. It verifies authorization, cross-origin writes, concurrent replay, server pricing, immutable sales ownership and queue status without contacting ERP.
