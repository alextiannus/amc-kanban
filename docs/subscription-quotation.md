# MM Subscription Quotation

Status: locally implemented; quotation-specific TypeScript checks, 11 tests, existing subscription pricing/workflow regression and rendered samples passed. Not deployed or tested with a real recipient.

The user chooses a plan and successfully submits the MM subscription request. This queues an English A4 quotation PDF to the authenticated account email, before payment confirmation. Selecting a plan alone does not send email. See the current contract in `prd_amc_mm.md` and the API response in `API_SERVICES.md`.

## Template

Issuer: DELIVERYCHINATOWN PTE. LTD., UEN / GST 201835327N, 22 Sin Ming Lane #06-76, Midview City, Singapore 573969. The supplied November 2025 and January 2026 tax invoices are visual/service references only. Their customers, invoice numbers and payment-advice sections are not copied. The generated document is a QUOTATION, not a tax invoice or payment receipt.

The order snapshot fixes account email, customer/brand, available address, selected plan and services, term, addon quantities/rates, discount, SGD subtotal, 9% GST and quotation total. Payment and trial rules remain separate. Missing corporate information is not invented. Reference is QT + Singapore order date + a stable subscription digest. `quotation.ts` owns the data and email template; `quotationPdf.ts` owns layout.

The existing licensed Noto Sans SC font is converted to TrueType in `public/fonts/quotation-noto-sans-sc.ttf`; see the font source and OFL. Full embedding is intentional: subsetting caused visibly missing characters. Chinese quotes are approximately 6 MB. This is a deliberate fidelity tradeoff, verified by rendering, rather than text extraction alone.

## Delivery and recovery

`SubscriptionQuotation.subscriptionId` is the unique key. A committed PENDING row exists before a successful subscription response. The response schedules `after()` delivery; the Node instrumentation worker also scans at startup and every 30 seconds. No historical subscriptions are backfilled. SMTP uses the existing database settings, never new environment credentials.

A CAS claim and unique lease token prevent concurrent dispatch and fence old workers. The PDF is generated once and stored before crossing the SMTP boundary. A pre-send failure retries up to five attempts with a persisted deadline. A stale PREPARING lease is safe to recover. SMTP ambiguity or a stale SENDING lease becomes UNKNOWN and requires operator reconciliation against SMTP logs using the deterministic Message-ID and saved quotation reference. Do not reset UNKNOWN and resend without verifying acceptance. A successful send followed by database receipt loss is also UNKNOWN, not an automatic retry. SENT means SMTP accepted, not inbox delivery.

Operators can inspect state, attempts, nextAttemptAt, lastError (sanitized codes), messageId and sentAt in the quotation record. Payload/PDF contain customer data and must not be logged or exposed through unauthenticated APIs. Customer and commercial snapshots are preserved even if the linked brand/user is removed.

## Local validation and release

Run `npm run test:subscription-quotation` and `npm run test:subscription`. To export safe sample PDFs, set QUOTATION_PREVIEW_DIR to a local output directory when running the quotation suite. Tests use synthetic customers, a disposable PostgreSQL engine and SMTP/Stripe substitutes; they do not prove real mailbox delivery.

Before release, install locked dependencies, run `prisma generate`, apply migration `20261029070000_subscription_quotation` before starting the application, include the public font assets and verify database-backed SMTP configuration. Existing unrelated workspace changes must be excluded from release. Deployment SHA, worker startup and a controlled recipient's actual email/PDF must be verified separately. No production migration, deployment or real-email test is included in the local implementation evidence.

## Verification record (2026-10-29)

Passed: quotation-specific semantic TypeScript check (all `src/lib/subscription/quotation*.ts`, including Prisma service and mail dependencies), Prisma client generation, 11 quotation/route tests, existing subscription price/workflow regressions, `git diff --check`, and A4 Starter/Essential/Booster PDF visual inspection including Chinese names. Additional tests cover Singapore date rollover and a small English-only PDF. PostgreSQL tests apply the actual new migration in a disposable PGlite database.

The full repository typecheck could not complete because local dependency files stalled in synchronous reads. Locked-version dependency restoration resolved several files; the final blocked read was `node_modules/@date-fns/tz/tzScan/index.d.ts`. The check was stopped rather than reported as passing. No full build, production migration, deployed SHA or real-recipient inbox evidence is claimed.

## Optional company title (2026-10-29, locally verified; not released)

The existing confirmation step has an optional form with the exact text “Please provide the following to get a quotation with title.” and independent Company name / UEN inputs. Either or both may be skipped. Both new-brand and existing-brand MM submissions forward the fields; empty values are omitted. New-brand/manage-subscription entry resets the fields to avoid reusing another customer's company information.

The server accepts only strings within 200 / 32 characters and rejects control characters before order mutation. Submitted company name takes precedence for the quotation customer title; UEN appears in the customer block. Both fields are stored in the existing immutable JSON snapshot, with no schema change, no account/brand rename, and no rewrite of previously issued quotations.

Validation: 14 backend quotation/route tests passed, including skip/partial/full/invalid input cases. MM full typecheck and backend quotation-specific typecheck passed. The real BrandWizardModal component passed fill-and-skip browser checks at 320/390/1440 pixels in English and 390 pixels in Chinese; screenshots reviewed. A synthetic-company PDF was rendered and checked for correct title/UEN placement. These checks use a local component harness and service substitutes, not a production subscription or real email recipient.

MM 邮件替代规则（2026-10-29，本地修复，待发布）：MM 成功提交订阅后，持久化 Quotation 是唯一订阅通知，替代品牌创建后的附服务条款邮件；在线付款确认同样不再额外发送旧订阅成功/条款通知。Stripe 元数据仅记录 clientType，确认阶段识别已有报价或可信 MM 来源，沿用同一报价记录与幂等投递。非 MM 流程、新账号注册欢迎邮件不在此次替代范围。已发出的历史邮件不撤回，未知 SMTP 受理状态不盲目重发。
