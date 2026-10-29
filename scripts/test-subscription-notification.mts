import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync('src/app/api/subscription/confirm/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
async function confirm({ mm = true, quote = false, metadataMm = false, newBrand = true } = {}) {
  let terms = 0, quotations = 0, dispatches = 0
  const brandCreations: any[] = [], after: (() => Promise<void>)[] = []
  const sub = { id: 'subscription', createdById: 'user', brandId: 'brand', paymentSessionId: 'checkout', planName: 'Starter', planId: 'starter', totalDueUsd: 5200, durationMonths: 12 }
  class Stripe { checkout = { sessions: { retrieve: async () => ({ id: 'checkout', payment_status: 'paid', metadata: { ...(metadataMm ? { clientType: 'mm' } : {}), ...(newBrand ? { pendingBrandName: 'Example', pendingBrandOwnerEmail: 'fixture@example.com', pendingBrandAddress: 'Fixture address' } : {}) } }) } } }
  const prisma = {
    brandSubscription: { findFirst: async () => sub },
    subscriptionQuotation: { findUnique: async () => quote ? { subscriptionId: sub.id } : null },
    user: { findUnique: async () => ({ email: 'fixture@example.com', nickname: 'Fixture' }) },
    brand: { findUnique: async () => ({ name: 'Example', address: 'Fixture address' }) },
  }
  const modules: Record<string, any> = {
    'next/server': { NextResponse: { json: (data: any, init?: ResponseInit) => Response.json(data, init) }, after: (fn: any) => after.push(fn) },
    '@/lib/auth': { getSession: async () => ({ user: { id: 'user' } }) },
    '@/lib/prisma': { prisma }, stripe: { default: Stripe },
    '@/lib/subscription/service': { activateSubscriptionByPaymentSession: async () => ({ ok: true, alreadyActive: true, subscription: sub }), createBrandForActivatedSubscription: async (input: any) => { brandCreations.push(input); return { ok: true, brand: { id: 'brand', name: 'Example', address: 'Fixture address' } } } },
    '@/lib/integrations/immediErp': { triggerErpOnboardingFlow: async () => null },
    '@/lib/email': { sendSubscriptionSuccessEmail: async () => { terms++ } },
    '@/lib/subscription/quotationService': { queueSubscriptionQuotation: async () => { quotations++ }, dispatchSubscriptionQuotation: async () => { dispatches++ } },
  }
  const exports: any = {}
  vm.runInNewContext(compiled, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name] }, process: { env: { STRIPE_SECRET_KEY: 'test-only' } }, console: { log() {}, error() {} }, Boolean, String })
  const response = await exports.POST(new Request('https://example.com/api/subscription/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(mm ? { 'x-client-type': 'mm' } : {}) }, body: JSON.stringify({ checkoutSessionId: 'checkout', subscriptionId: 'subscription' }) }))
  for (const fn of after) await fn()
  return { response, terms, quotations, dispatches, brandCreations }
}
test('MM paid confirmation uses quotation and suppresses both old terms-email paths', async () => {
  for (const options of [{ mm: true }, { mm: false, quote: true }, { mm: false, metadataMm: true }]) {
    const result = await confirm(options)
    assert.equal(result.response.status, 200)
    assert.equal(result.terms, 0); assert.equal(result.quotations, 1); assert.equal(result.dispatches, 1)
    assert.equal(result.brandCreations[0].notificationMode, 'quotation')
  }
})
test('existing-brand MM confirmation also uses only quotation notification', async () => {
  const result = await confirm({ newBrand: false })
  assert.equal(result.response.status, 200); assert.equal(result.terms, 0); assert.equal(result.quotations, 1)
})
test('non-MM confirmation retains its existing terms mail behavior', async () => {
  const result = await confirm({ mm: false })
  assert.equal(result.response.status, 200); assert.equal(result.terms, 1); assert.equal(result.quotations, 0)
  assert.equal(result.brandCreations[0].notificationMode, 'service_terms')
})
