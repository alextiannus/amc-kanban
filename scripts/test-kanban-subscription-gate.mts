import assert from 'node:assert/strict'
import { hasActiveBrandSubscription, needsBrandSubscriptionGate } from '../src/lib/subscription/kanbanGate.ts'

const tomorrow = new Date(Date.now() + 86400_000).toISOString()
const yesterday = new Date(Date.now() - 86400_000).toISOString()
assert.equal(hasActiveBrandSubscription([{ status: 'ACTIVE', subscriptions: [{ status: 'ACTIVE', contractEndDate: tomorrow }] }]), true)
assert.equal(hasActiveBrandSubscription([{ status: 'ACTIVE', subscriptions: [{ status: 'ACTIVE', contractEndDate: yesterday }] }]), false)
assert.equal(hasActiveBrandSubscription([{ status: 'ACTIVE', subscriptions: [] }]), false)
assert.equal(hasActiveBrandSubscription([{ status: 'ARCHIVED', subscriptions: [{ status: 'ACTIVE' }] }]), false)
assert.equal(needsBrandSubscriptionGate(['BRAND_OWNER'], ['brand.read']), true)
assert.equal(needsBrandSubscriptionGate([], ['content.video-making.read']), false)
assert.equal(needsBrandSubscriptionGate(['ADMIN'], ['brand.read']), false)
assert.equal(needsBrandSubscriptionGate(['AMC_PRINCIPAL'], ['brand.read']), false)
console.log('Kanban subscription gate checks passed')
