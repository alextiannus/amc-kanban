import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as catalogue from '../src/lib/subscription/catalog.ts'
import * as workflow from '../src/lib/subscription/workflow.ts'

const compiled = ts.transpileModule(readFileSync('src/app/api/mm/subscription/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
async function run(options: { mode?: string; newBrand?: boolean; candidate?: any; noEmail?: boolean; unauthorized?: boolean; denied?: boolean; invalid?: boolean; stripeMissing?: boolean; stripeFailed?: boolean; brandFailed?: boolean; promo?: boolean; kanban?: boolean; quotationCompanyName?: unknown; quotationUen?: unknown } = {}) {
  const queue: any[] = [], after: (() => Promise<void>)[] = [], checkouts: any[] = [], created: any[] = []
  let sub: any
  const prisma = {
    user: { findUnique: async () => ({ email: options.noEmail ? '' : 'account@example.com', nickname: 'Account' }) },
    brand: { findFirst: async () => options.candidate ? { id: 'brand', name: 'Merchant', subscriptions: [options.candidate] } : null, findUnique: async () => ({ id: 'brand', name: 'Merchant', ownerId: 'user' }) },
    campaignPromoCode: { findUnique: async () => options.promo ? { id: 'promo', isActive: true, expiresAt: null, maxUses: null, discountType: 'PERCENT', discountValue: 10 } : null, update: async () => ({}) },
    promoCodeUsage: { create: async () => ({}) },
    brandSubscription: {
      create: async ({ data }: any) => { sub = { id: 'new-sub', createdAt: new Date(), ...data }; created.push(sub); return sub },
      update: async ({ where, data }: any) => ({ ...sub, ...options.candidate, id: where.id, ...data }),
      findUnique: async () => sub,
    },
  }
  class Stripe {
    checkout = { sessions: { create: async (input: any) => { if (options.stripeFailed) throw new Error('Stripe failed'); checkouts.push(input); return { id: 'checkout', url: 'https://checkout.example.com' } } } }
  }
  const modules: Record<string, any> = {
    'next/server': { NextResponse: { json: (data: any, init?: ResponseInit) => Response.json(data, init) }, after: (task: any) => after.push(task) },
    '@/lib/auth': { getSession: async () => options.unauthorized ? null : { user: { id: 'user', email: 'account@example.com' } } },
    '@/lib/auth-v2': { authenticateRequest: async () => ({}), canAccessBrand: async () => !options.denied },
    '@/lib/prisma': { prisma }, '@prisma/client': {}, stripe: { default: Stripe },
    '@/lib/subscription/catalog': catalogue, '@/lib/subscription/workflow': workflow,
    '@/lib/subscription/service': { createBrandForActivatedSubscription: async () => options.brandFailed ? { ok: false } : { ok: true, brand: { id: 'brand', name: 'Merchant' } } },
    '@/lib/brandOwnerAccount': { findOrCreateBrandOwnerAccount: async () => ({ ok: true, user: { id: 'user' } }) },
    '@/lib/subscription/quotationService': { queueSubscriptionQuotation: async (input: any) => { queue.push(input); return { number: 'QT-test', state: 'PENDING' } }, dispatchSubscriptionQuotation: async () => {} },
  }
  const exports: any = {}
  vm.runInNewContext(compiled, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name] }, process: { env: { STRIPE_SECRET_KEY: options.stripeMissing ? '' : 'test-only-key' } }, console: { log() {}, error() {} }, URL, URLSearchParams, Date, Set })
  const body = { quotationCompanyName: options.quotationCompanyName, quotationUen: options.quotationUen, planId: options.invalid ? 'bad-plan' : 'essential', durationMonths: 12, paymentMode: options.mode ?? 'BILLING', ...(options.newBrand || options.candidate ? { pendingBrandName: 'Merchant' } : { brandId: 'brand' }), ...(options.promo ? { promoCode: 'TEST' } : {}) }
  const response = await exports.POST(new Request('https://amc.example.com/api/mm/subscription', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(options.kanban ? {} : { 'x-client-type': 'mm' }) }, body: JSON.stringify(body) }))
  return { response, payload: await response.json(), queue, after, created, checkouts }
}

test('new brand, existing brand, offline and online success queue before response; selection alone has no effect', async () => {
  for (const options of [{ newBrand: true }, {}, { mode: 'OFFLINE' }, { mode: 'ONLINE', newBrand: true }]) {
    const result = await run(options)
    assert.equal(result.response.status, 200)
    assert.equal(result.queue.length, 1); assert.equal(result.after.length, 1)
    assert.equal(result.queue[0].recipient, 'account@example.com')
    assert.equal(result.queue[0].subscriptionId, 'new-sub'); assert.equal(result.payload.quotation.number, 'QT-test')
  }
})
test('same pending selected order is reused; selecting a different plan does not email the old plan', async () => {
  const candidate = { id: 'old-sub', createdById: 'user', planId: 'essential', durationMonths: 12, totalDueUsd: 10600, currency: 'SGD', selectedAddons: [] }
  const reused = await run({ candidate })
  assert.equal(reused.response.status, 200); assert.equal(reused.created.length, 0); assert.equal(reused.queue[0].subscriptionId, 'old-sub')
  const changed = await run({ candidate: { ...candidate, planId: 'starter', totalDueUsd: 5200 } })
  assert.equal(changed.created.length, 1); assert.equal(changed.queue[0].subscriptionId, 'new-sub')
})
test('failed requests and non-MM clients do not queue quotation email', async () => {
  for (const options of [{ noEmail: true }, { unauthorized: true }, { denied: true }, { invalid: true }, { mode: 'ONLINE', stripeMissing: true }, { mode: 'ONLINE', stripeFailed: true }, { newBrand: true, brandFailed: true }]) {
    const result = await run(options)
    assert.ok(result.response.status >= 400, JSON.stringify(options)); assert.equal(result.queue.length, 0)
  }
  assert.equal((await run({ kanban: true })).queue.length, 0)
})
test('discounted persisted order, response, online charge and quotation all use the same net amount', async () => {
  const result = await run({ mode: 'ONLINE', promo: true })
  assert.equal(result.created[0].totalDueUsd, 9540)
  assert.equal(result.checkouts[0].line_items[0].price_data.unit_amount, 954000)
  assert.equal(result.queue[0].originalTotal, 10600)
})


test('optional quotation title is forwarded on new-brand and existing-brand subscriptions', async () => {
  for (const newBrand of [true, false]) {
    const result = await run({ newBrand, quotationCompanyName: '  Example Merchant Pte. Ltd.  ', quotationUen: '  EXAMPLE-UEN  ' })
    assert.equal(result.response.status, 200)
    assert.equal(result.queue[0].companyName, 'Example Merchant Pte. Ltd.')
    assert.equal(result.queue[0].uen, 'EXAMPLE-UEN')
  }
  for (const fields of [{}, { quotationCompanyName: '' }, { quotationUen: 'EXAMPLE-UEN' }, { quotationCompanyName: 'Example Ltd' }]) {
    assert.equal((await run(fields)).response.status, 200)
  }
})
test('malformed optional quotation fields are rejected before creating an order or email', async () => {
  for (const fields of [{ quotationCompanyName: {} }, { quotationCompanyName: 'x'.repeat(201) }, { quotationUen: 123 }, { quotationUen: 'x'.repeat(33) }, { quotationCompanyName: 'Name\r\nInjected' }]) {
    const result = await run(fields)
    assert.equal(result.response.status, 400); assert.equal(result.created.length, 0); assert.equal(result.queue.length, 0)
  }
})
