# ImmediToday synchronization

Status: implemented, pending production verification.

Run `prisma migrate deploy` before starting the new build. The migration's durable `rollout` row marks the cutoff for newly submitted subscriptions; existing contracts are not bulk-imported. A subsequent brand assignment on an existing contract synchronizes that contract with the same subscription retry key before writing its Project.

Configuration remains in `SystemConfig`: `immediErpEnabled`, existing `immediErpApiKey`, `immediErpBaseUrl`, `immediErpItemCodeMap`, `immediErpCostCenter` (default `Main - IMD`), and `immediErpEmployeeMap` (exact AMC user ID or lowercase email to verified ERP Lark employee ID). The existing AMC key needs `sales_orders` and the separately authorized `brand_assignments` scope. Do not copy secrets into migration scripts or logs.

The worker scans persisted subscriptions and HUMAN PRINCIPAL crew changes every minute. It stores receipts/errors in `ImmediErpSync`, retries failures with bounded exponential backoff, and holds PostgreSQL advisory transaction locks during a synchronization attempt. A verified ERP order name is mandatory for success. The subscription retry key is `amc-sub-{id}`. The receiver stores monotonically increasing assignment revisions, rejects changed replays and stale overwrites, and reconciles both principals on transfers.

Only Xiao Han and Luo Yueling may receive new brand assignments in ERP. Configure their exact employee mappings, and complete the ERP location so incentive currency can be determined. Li Wei's ERP title is 私域运营官 / Private Domain Operations Officer. Merchant owners, AI agents and crew editors are not brand incentive recipients.

Financial rules: persist actual currency and post-discount amounts; allocate subscription discounts across service lines in cents; never invent a customer phone, SKU, cost estimate or payment. Zero-value/waived contracts and unsupported SKUs remain failed with actionable errors for ERP review. Creating a Sales Order creates a draft. Formal submission retains ERP profitability-review requirements; subscription activation alone does not satisfy them. Brand rewards are pending, not paid.

Verification:

- `npm run typecheck`
- `DATABASE_URL=postgresql://test:test@localhost:5432/test node --import tsx --test scripts/test-immedi-erp.mts` (mocked network; does not connect to that database)
- `npm run test:subscription`
- `npm run build`
- Read masked production configuration, migration status, `ImmediErpSync` receipts and the corresponding ERP Project/order. Never create fabricated production subscriptions to smoke-test accounting.
