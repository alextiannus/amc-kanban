#!/usr/bin/env node
import assert from 'node:assert/strict'
import { findUniqueLegacyPostMatch } from '../src/lib/draftStatusReconciliation.ts'

const scheduledAt = new Date('2026-07-31T06:55:00.000Z')
const providerPosts = [
  {
    id: 'pf-instagram',
    socialMediaId: 'account-instagram',
    platform: '',
    platformId: '',
    caption: 'Same campaign caption\n\n#SuperRola #SG',
    status: 'published' as const,
    publishedAt: '2026-07-31T06:55:50.227Z',
  },
  {
    id: 'pf-tiktok',
    socialMediaId: 'account-tiktok',
    platform: '',
    platformId: '',
    caption: 'Same campaign caption',
    status: 'published' as const,
    publishedAt: '2026-07-31T06:55:17.584Z',
  },
]

const instagram = findUniqueLegacyPostMatch({
  caption: 'Same   campaign caption',
  hashtags: ['SuperRola', '#SG'],
  scheduledAt,
  providerAccountId: 'account-instagram',
  providerPosts,
  claimedProviderIds: new Set(),
  now: Date.parse('2026-07-31T07:00:00.000Z'),
})
assert.equal(instagram.post?.id, 'pf-instagram')
assert.equal(instagram.ambiguousCount, 1)

const ambiguous = findUniqueLegacyPostMatch({
  caption: 'Same campaign caption',
  hashtags: ['SuperRola', 'SG'],
  scheduledAt,
  providerPosts,
  claimedProviderIds: new Set(),
  now: Date.parse('2026-07-31T07:00:00.000Z'),
})
assert.equal(ambiguous.post, undefined)
assert.equal(ambiguous.ambiguousCount, 2)

const futureDraft = findUniqueLegacyPostMatch({
  caption: 'Same campaign caption',
  scheduledAt: new Date('2026-07-31T08:00:00.000Z'),
  providerAccountId: 'account-instagram',
  providerPosts,
  claimedProviderIds: new Set(),
  now: Date.parse('2026-07-31T07:00:00.000Z'),
})
assert.equal(futureDraft.post, undefined)
assert.equal(futureDraft.ambiguousCount, 0)

const claimed = findUniqueLegacyPostMatch({
  caption: 'Same campaign caption',
  scheduledAt,
  providerAccountId: 'account-instagram',
  providerPosts,
  claimedProviderIds: new Set(['pf-instagram']),
  now: Date.parse('2026-07-31T07:00:00.000Z'),
})
assert.equal(claimed.post, undefined)

console.log('Draft status reconciliation tests passed.')
