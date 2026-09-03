#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  MANUAL_HISTORICAL_POST_MARKER,
  chooseTikTokRepairAccount,
  inspectManualHistoricalDraft,
  parseTikTokPostUrl,
} from '../src/lib/manualHistoricalPlatformRepair.ts'

assert.deepEqual(parseTikTokPostUrl('https://www.tiktok.com/@Demo.Brand/video/123'), {
  hostname: 'www.tiktok.com',
  handle: 'demo.brand',
})
assert.deepEqual(parseTikTokPostUrl('https://vm.tiktok.com/abc123/'), { hostname: 'vm.tiktok.com' })
assert.equal(parseTikTokPostUrl('https://tiktok.com.example.com/@fake/video/1'), null)
assert.equal(parseTikTokPostUrl('not-a-url'), null)

const base = {
  agentNote: MANUAL_HISTORICAL_POST_MARKER,
  status: 'published',
  platformPostId: null,
  postUrl: 'https://www.tiktok.com/@demo/video/123',
  deliveryJobCount: 0,
  account: { platformId: 'instagram', handle: 'unconfigured' },
}

assert.deepEqual(inspectManualHistoricalDraft(base), {
  kind: 'repair',
  reason: 'confirmed_tiktok_url',
  tiktokHandle: 'demo',
})
assert.equal(inspectManualHistoricalDraft({ ...base, postUrl: null }).kind, 'review')
assert.equal(inspectManualHistoricalDraft({ ...base, postUrl: 'https://instagram.com/p/abc' }).kind, 'ignore')
assert.equal(inspectManualHistoricalDraft({ ...base, postUrl: 'https://example.com/post/abc' }).kind, 'review')
assert.equal(inspectManualHistoricalDraft({ ...base, platformPostId: 'provider-post' }).kind, 'review')
assert.equal(inspectManualHistoricalDraft({ ...base, deliveryJobCount: 1 }).kind, 'review')
assert.equal(inspectManualHistoricalDraft({ ...base, account: { platformId: 'tiktok', handle: 'unconfigured' } }).kind, 'ignore')

const accounts = [
  { id: 'real-demo', platformId: 'tiktok', handle: '@Demo' },
  { id: 'placeholder', platformId: 'tiktok', handle: 'unconfigured' },
  { id: 'instagram', platformId: 'instagram', handle: 'demo' },
]
assert.equal(chooseTikTokRepairAccount(accounts, 'demo')?.id, 'real-demo')
assert.equal(chooseTikTokRepairAccount(accounts, 'unknown')?.id, 'placeholder')
assert.equal(chooseTikTokRepairAccount(accounts.filter(account => account.id !== 'placeholder'), 'unknown'), null)
assert.equal(chooseTikTokRepairAccount([...accounts, { id: 'duplicate', platformId: 'tiktok', handle: 'demo' }], 'demo')?.id, 'placeholder')

console.log('manual historical platform repair tests passed')
