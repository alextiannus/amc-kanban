#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  findUniqueLegacyPostMatch,
  isDraftReconciliationStale,
  normalizeReconciliationCaption,
} from '../src/lib/draftStatusReconciliation.ts'

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

assert.equal(
  normalizeReconciliationCaption('超级蒜蓉大虾\u200B\u200B：  ＳＧ'),
  '超级蒜蓉大虾: SG',
)

const unicodeMatch = findUniqueLegacyPostMatch({
  caption: '超级蒜蓉大虾\u200B\u200B：新品',
  scheduledAt,
  providerAccountId: 'account-instagram',
  providerPosts: [{
    id: 'pf-unicode',
    socialMediaId: 'account-instagram',
    platform: '',
    platformId: '',
    caption: '超级蒜蓉大虾:新品',
    status: 'published' as const,
    publishedAt: '2026-07-31T06:55:10.000Z',
  }],
  claimedProviderIds: new Set(),
  now: Date.parse('2026-07-31T07:00:00.000Z'),
})
assert.equal(unicodeMatch.post?.id, 'pf-unicode')

const closestTimeMatch = findUniqueLegacyPostMatch({
  caption: 'Closest campaign',
  scheduledAt,
  providerAccountId: 'account-instagram',
  providerPosts: [
    {
      id: 'pf-one-minute-early',
      socialMediaId: 'account-instagram',
      platform: '',
      platformId: '',
      caption: 'Closest campaign',
      status: 'published' as const,
      scheduledAt: '2026-07-31T06:54:00.000Z',
    },
    {
      id: 'pf-exact-time',
      socialMediaId: 'account-instagram',
      platform: '',
      platformId: '',
      caption: 'Closest campaign',
      status: 'published' as const,
      scheduledAt: '2026-07-31T06:55:00.000Z',
    },
  ],
  claimedProviderIds: new Set(),
  now: Date.parse('2026-07-31T07:00:00.000Z'),
})
assert.equal(closestTimeMatch.post?.id, 'pf-exact-time')

const duplicateConsensus = findUniqueLegacyPostMatch({
  caption: 'Duplicate campaign',
  scheduledAt,
  providerAccountId: 'account-instagram',
  providerPosts: [
    {
      id: 'pf-later',
      socialMediaId: 'account-instagram',
      platform: '',
      platformId: '',
      caption: 'Duplicate campaign',
      status: 'published' as const,
      scheduledAt: '2026-07-31T06:55:00.000Z',
      publishedAt: '2026-07-31T06:55:30.000Z',
    },
    {
      id: 'pf-earlier',
      socialMediaId: 'account-instagram',
      platform: '',
      platformId: '',
      caption: 'Duplicate campaign',
      status: 'published' as const,
      scheduledAt: '2026-07-31T06:55:00.000Z',
      publishedAt: '2026-07-31T06:55:10.000Z',
    },
  ],
  claimedProviderIds: new Set(),
  now: Date.parse('2026-07-31T07:00:00.000Z'),
})
assert.equal(duplicateConsensus.post?.id, 'pf-earlier')
assert.equal(duplicateConsensus.equivalentDuplicateCount, 2)
assert.deepEqual(new Set(duplicateConsensus.matchedPostIds), new Set(['pf-later', 'pf-earlier']))

const conflictingDuplicate = findUniqueLegacyPostMatch({
  caption: 'Conflicting campaign',
  scheduledAt,
  providerAccountId: 'account-instagram',
  providerPosts: [
    {
      id: 'pf-published',
      socialMediaId: 'account-instagram',
      platform: '',
      platformId: '',
      caption: 'Conflicting campaign',
      status: 'published' as const,
      publishedAt: '2026-07-31T06:55:10.000Z',
    },
    {
      id: 'pf-failed',
      socialMediaId: 'account-instagram',
      platform: '',
      platformId: '',
      caption: 'Conflicting campaign',
      status: 'failed' as const,
      scheduledAt: '2026-07-31T06:55:00.000Z',
    },
  ],
  claimedProviderIds: new Set(),
  now: Date.parse('2026-07-31T07:00:00.000Z'),
})
assert.equal(conflictingDuplicate.post, undefined)
assert.equal(conflictingDuplicate.ambiguousCount, 2)

assert.equal(isDraftReconciliationStale({
  status: 'publishing',
  scheduledAt: null,
  updatedAt: new Date('2026-07-31T06:30:00.000Z'),
  now: new Date('2026-07-31T07:00:00.000Z'),
}), true)
assert.equal(isDraftReconciliationStale({
  status: 'scheduled',
  scheduledAt: new Date('2026-07-31T06:31:00.000Z'),
  updatedAt: new Date('2026-07-31T06:00:00.000Z'),
  now: new Date('2026-07-31T07:00:00.000Z'),
}), false)

console.log('Draft status reconciliation tests passed.')
