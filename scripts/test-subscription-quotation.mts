import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { PGlite } from '@electric-sql/pglite'
import { buildQuotation, quotationEmail } from '../src/lib/subscription/quotation.ts'
import { renderQuotationPdf } from '../src/lib/subscription/quotationPdf.ts'
import { deliverQuotation, recoverQuotationLeases } from '../src/lib/subscription/quotationDelivery.ts'
import { SUBSCRIPTION_PLANS, calculatePricing } from '../src/lib/subscription/catalog.ts'

const source = { id: 'fixture-subscription', createdAt: new Date('2026-10-29T01:00:00Z'), planName: 'Essential AI Marketing Crew', durationMonths: 12, currency: 'SGD', totalDueUsd: 10600, recurringAddonsUsd: 0, oneTimeAddonsUsd: 0, selectedAddons: [] }
const input = { subscription: source, recipient: 'merchant@example.com', customer: '示例商户 PTE. LTD.', brandName: '示例品牌', address: '', services: SUBSCRIPTION_PLANS.find(p => p.id === 'essential')!.includes }

test('reference amounts, actual discounts, addons and cent rounding reconcile', () => {
  const essential = buildQuotation(input)
  assert.equal(essential.gstCents, 95400); assert.equal(essential.totalCents, 1155400)
  const starter = buildQuotation({ ...input, subscription: { ...source, totalDueUsd: 5200 } })
  assert.equal(starter.totalCents, 566800)
  const discounted = buildQuotation({ ...input, originalTotal: 11000, subscription: { ...source, totalDueUsd: 10000, oneTimeAddonsUsd: 400, selectedAddons: [{ id: 'tokens', name: 'Token pack', pricing: 'one_time', usd: 200, quantity: 2 }] } })
  assert.equal(discounted.discountCents, 100000)
  assert.equal(discounted.lines[0].amountCents, 1060000)
  assert.equal(discounted.lines.reduce((sum, line) => sum + line.amountCents, 0) - discounted.discountCents, discounted.subtotalCents)
  assert.equal(discounted.totalCents, 1090000)
  assert.equal(buildQuotation({ ...input, subscription: { ...source, totalDueUsd: 10.05 } }).gstCents, 90)
  assert.equal(buildQuotation(input).number, essential.number)
  assert.ok(buildQuotation({ ...input, subscription: { ...source, createdAt: new Date('2026-10-28T18:00:00Z') } }).number.startsWith('QT20261029-'))
  assert.notEqual(buildQuotation({ ...input, subscription: { ...source, id: 'different' } }).number, essential.number)
})
test('invalid currency, recipient and mismatched commercial data cannot produce a quote', () => {
  assert.throws(() => buildQuotation({ ...input, recipient: 'bad\r\nBcc: x@y.com' }))
  assert.throws(() => buildQuotation({ ...input, subscription: { ...source, currency: 'USD' } }))
  assert.throws(() => buildQuotation({ ...input, subscription: { ...source, oneTimeAddonsUsd: 200 } }))
  assert.throws(() => buildQuotation({ ...input, originalTotal: 1 }))
  assert.throws(() => buildQuotation({ ...input, subscription: { ...source, totalDueUsd: NaN } }))
  const mail = quotationEmail(buildQuotation({ ...input, customer: '<script>alert(1)</script>' }))
  assert.ok(!mail.html.includes('<script>')); assert.ok(mail.html.includes('&lt;script&gt;'))
})
test('PDF supports Chinese customer names, all packages, long rows and multipage service text', async () => {
  for (const plan of SUBSCRIPTION_PLANS) {
    const price = calculatePricing(plan.id, 12, [])
    const quote = buildQuotation({ ...input, subscription: { ...source, id: `preview-${plan.id}`, planName: plan.name, totalDueUsd: price.totalDueUsd }, services: plan.includes })
    const pdf = await renderQuotationPdf(quote)
    const parsed = await PDFDocument.load(pdf)
    assert.ok(parsed.getPageCount() >= 1)
    assert.ok(parsed.getPages().every(page => page.getWidth() === 595 && page.getHeight() === 842))
    if (process.env.QUOTATION_PREVIEW_DIR) {
      mkdirSync(process.env.QUOTATION_PREVIEW_DIR, { recursive: true })
      writeFileSync(`${process.env.QUOTATION_PREVIEW_DIR}/AMC-Quotation-${plan.id}-sample.pdf`, pdf)
    }
  }
  const english = buildQuotation({ ...input, customer: 'Example Merchant Pte. Ltd.', brandName: 'Example Brand' })
  assert.ok((await renderQuotationPdf(english)).length < 100_000)
  const long = buildQuotation({ ...input, customer: '示例客户'.repeat(25), services: Array(45).fill('Long service explanation with multilingual customer details and full support. '.repeat(3)) })
  assert.ok((await PDFDocument.load(await renderQuotationPdf(long))).getPageCount() >= 3)
})

// Run the real migration in a disposable PostgreSQL engine. This store adapter
// translates Prisma predicates to SQL so concurrency exercises real CAS/PK rules.
async function fixture() {
  const pg = new PGlite()
  await pg.exec(readFileSync('prisma/migrations/20261029070000_subscription_quotation/migration.sql', 'utf8'))
  const now = new Date('2026-10-29T01:00:00Z')
  await pg.query('INSERT INTO "SubscriptionQuotation" ("subscriptionId", recipient, snapshot, "updatedAt", "nextAttemptAt") VALUES ($1,$2,$3,$4,$4)', [source.id, input.recipient, buildQuotation(input), now])
  const read = async () => (await pg.query<any>('SELECT * FROM "SubscriptionQuotation" WHERE "subscriptionId"=$1', [source.id])).rows[0]
  const store: any = { subscriptionQuotation: {
    findUnique: read,
    updateMany: async ({ where, data }: any) => {
      const params: any[] = [], bind = (value: any) => { params.push(value); return `$${params.length}` }
      const sets = Object.entries(data).map(([key, value]: any) => `"${key}"=${value?.increment ? `"${key}"+${bind(value.increment)}` : bind(value)}`)
      if (!('updatedAt' in data)) sets.push(`"updatedAt"=${bind(now)}`)
      const conditions: string[] = []
      if (where.subscriptionId) conditions.push(`"subscriptionId"=${bind(where.subscriptionId)}`)
      if (typeof where.state === 'string') conditions.push(`state=${bind(where.state)}`)
      else if (where.state?.in) conditions.push(`state=ANY(${bind(where.state.in)})`)
      if (where.attempts?.lt) conditions.push(`attempts<${bind(where.attempts.lt)}`)
      if (where.nextAttemptAt?.lte) conditions.push(`"nextAttemptAt"<=${bind(where.nextAttemptAt.lte)}`)
      if (where.updatedAt?.lt) conditions.push(`"updatedAt"<${bind(where.updatedAt.lt)}`)
      if (where.leaseToken) conditions.push(`"leaseToken"=${bind(where.leaseToken)}`)
      const result = await pg.query(`UPDATE "SubscriptionQuotation" SET ${sets.join(',')} WHERE ${conditions.join(' AND ')} RETURNING "subscriptionId"`, params)
      return { count: result.rows.length }
    },
  } }
  return { pg, store, read, now }
}

test('concurrent dispatch sends once, persists PDF and receipt, and SENT survives restarts', async () => {
  const { pg, store, read, now } = await fixture(); let sends = 0, renders = 0
  const deps = { database: store, now: () => now, render: async () => { renders++; return Buffer.from('%PDF-test') }, send: async () => { sends++; return { success: true, messageId: 'smtp-id' } } }
  try {
    await Promise.all([deliverQuotation(source.id, deps), deliverQuotation(source.id, deps)])
    assert.equal(sends, 1); assert.equal(renders, 1)
    assert.equal((await read()).state, 'SENT'); assert.equal((await read()).messageId, 'smtp-id')
    await deliverQuotation(source.id, { ...deps }); assert.equal(sends, 1)
    await assert.rejects(pg.query('INSERT INTO "SubscriptionQuotation" SELECT * FROM "SubscriptionQuotation"'))
  } finally { await pg.close() }
})
test('definitely not sent retries after deadline using the saved PDF', async () => {
  const { pg, store, read, now } = await fixture(); let renders = 0, sends = 0
  const deps = { database: store, now: () => now, render: async () => { renders++; return Buffer.from('fixed-pdf') }, send: async () => { sends++; return { success: false, deliveryState: 'NOT_SENT' as const } } }
  try {
    await deliverQuotation(source.id, deps); assert.equal((await read()).state, 'FAILED')
    await deliverQuotation(source.id, deps); assert.equal(sends, 1)
    await deliverQuotation(source.id, { ...deps, now: () => new Date(now.getTime() + 60_000), send: async row => { sends++; assert.equal(Buffer.from(row.pdf!).toString(), 'fixed-pdf'); return { success: true } } })
    assert.equal((await read()).state, 'SENT'); assert.equal(renders, 1); assert.equal(sends, 2)
  } finally { await pg.close() }
})
test('ambiguous SMTP and lost post-send DB receipts stop automated retries', async () => {
  for (const lostReceipt of [false, true]) {
    const { pg, store, read, now } = await fixture(); let sends = 0
    const original = store.subscriptionQuotation.updateMany
    if (lostReceipt) store.subscriptionQuotation.updateMany = (args: any) => args.data.state === 'SENT' ? Promise.reject(new Error('DB lost')) : original(args)
    const deps = { database: store, now: () => now, render: async () => Buffer.from('pdf'), send: async () => { sends++; return lostReceipt ? { success: true } : { success: false, deliveryState: 'UNKNOWN' as const } } }
    try {
      try { await deliverQuotation(source.id, deps) } catch { assert.ok(lostReceipt) }
      await recoverQuotationLeases(store, new Date(now.getTime() + 6 * 60_000))
      assert.equal((await read()).state, 'UNKNOWN')
      await deliverQuotation(source.id, deps); assert.equal(sends, 1)
    } finally { await pg.close() }
  }
})
test('a stale preparation lease cannot overwrite or send after another worker recovered it', async () => {
  const { pg, store, read, now } = await fixture(); let resume: (pdf: Buffer) => void = () => {}; let sends = 0
  const pending = new Promise<Buffer>(resolve => { resume = resolve })
  const deps = { database: store, now: () => now, render: async () => pending, send: async () => { sends++; return { success: true } } }
  try {
    const first = deliverQuotation(source.id, deps)
    while ((await read()).state !== 'PREPARING') await new Promise(resolve => setTimeout(resolve, 5))
    await recoverQuotationLeases(store, new Date(now.getTime() + 6 * 60_000))
    await deliverQuotation(source.id, { ...deps, now: () => new Date(now.getTime() + 7 * 60_000), render: async () => Buffer.from('new-pdf') })
    resume(Buffer.from('old-pdf')); await first
    assert.equal(sends, 1); assert.equal(Buffer.from((await read()).pdf).toString(), 'new-pdf')
  } finally { await pg.close() }
})


test('optional company title and UEN are snapshotted; missing fields preserve legacy fallback', () => {
  const quote = buildQuotation({ ...input, companyName: ' Example Merchant Pte. Ltd. ', uen: ' EXAMPLE-UEN ' })
  assert.equal(quote.customer, 'Example Merchant Pte. Ltd.')
  assert.equal(quote.companyName, 'Example Merchant Pte. Ltd.')
  assert.equal(quote.uen, 'EXAMPLE-UEN')
  assert.equal(quote.brandName, input.brandName)
  assert.equal(buildQuotation(input).customer, input.customer)
  assert.equal(buildQuotation({ ...input, companyName: ' ', uen: ' ' }).customer, input.customer)
  assert.equal(buildQuotation({ ...input, uen: 'EXAMPLE-UEN' }).customer, input.customer)
})
