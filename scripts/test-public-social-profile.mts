import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { publicSocialProfileResponse } from '../src/lib/publicSocialProfile.ts'

function compile(path: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as Record<string, unknown> }
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'module', 'exports', code)(
    (name: string) => {
      assert(name in dependencies, `Missing test dependency: ${name}`)
      return dependencies[name]
    },
    module,
    module.exports,
  )
  return module.exports as { GET(request: Request): Promise<Response> }
}

const missing = publicSocialProfileResponse({
  platform: 'instagram',
  handle: 'unknown_account',
  account: null,
})

assert.equal(missing.source, 'unavailable')
assert.equal(missing.availabilityStatus, 'MISSING')
assert.equal(missing.verificationStatus, 'UNVERIFIED')
assert.equal(missing.displayStatus, '未验证／待补充')
assert.equal(missing.requiresVerification, true)
assert.equal(missing.followerCount, null)
assert.equal(missing.postCount, null)
assert.equal(missing.avgEngagementRate, null)
assert.equal(missing.bio, null)
assert.equal(missing.profileUrl, null)
assert.deepEqual(missing.missingFields, [
  'displayName',
  'followerCount',
  'postCount',
  'avgEngagementRate',
  'bio',
  'profileUrl',
])

const recorded = publicSocialProfileResponse({
  platform: 'facebook',
  handle: 'recorded_account',
  account: {
    displayName: 'Recorded Account',
    followerCount: 0,
    profileUrl: 'https://www.facebook.com/recorded_account',
    snapshotAt: new Date('2026-09-01T00:00:00.000Z'),
    followerCountUpdatedAt: new Date('2026-10-01T00:00:00.000Z'),
  },
})

assert.equal(recorded.source, 'database_record')
assert.equal(recorded.availabilityStatus, 'RECORDED')
assert.equal(recorded.verificationStatus, 'UNVERIFIED')
assert.equal(recorded.displayStatus, '已记录，未实时验证')
assert.equal(recorded.followerCount, 0)
assert.equal(recorded.observedAt, '2026-10-01T00:00:00.000Z')
assert.deepEqual(recorded.missingFields, ['postCount', 'avgEngagementRate', 'bio'])

const blankRecordedFields = publicSocialProfileResponse({
  platform: 'instagram',
  handle: 'blank_fields',
  account: {
    displayName: '   ',
    followerCount: null,
    profileUrl: '',
    snapshotAt: null,
    followerCountUpdatedAt: null,
  },
})
assert.equal(blankRecordedFields.displayName, null)
assert.equal(blankRecordedFields.profileUrl, null)
assert(blankRecordedFields.missingFields.includes('displayName'))
assert(blankRecordedFields.missingFields.includes('profileUrl'))

const route = await readFile(new URL('../src/app/api/integrations/social/public-profile/route.ts', import.meta.url), 'utf8')
assert(!route.includes('scraped_fallback'))
assert(!route.includes('Math.round'))
assert(!route.includes('关注我们，获取最新产品动态'))
assert(route.includes('publicSocialProfileResponse'))
assert(route.includes('unboundAt: null'))

let databaseAccount: Parameters<typeof publicSocialProfileResponse>[0]['account'] = null
let capturedQuery: unknown = null
const handler = compile('src/app/api/integrations/social/public-profile/route.ts', {
  'next/server': { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } },
  '@/lib/auth': {
    getSession: async () => ({ user: { id: 'operator' } }),
    extractApiKey: () => null,
    getAgentFromApiKey: async () => null,
  },
  '@/lib/prisma': {
    prisma: {
      socialAccount: {
        findFirst: async (query: unknown) => {
          capturedQuery = query
          return databaseAccount
        },
      },
    },
  },
  '@/lib/publicSocialProfile': { publicSocialProfileResponse },
})

let response = await handler.GET(new Request('http://localhost/api/integrations/social/public-profile?platform=instagram&handle=%40unknown_account'))
assert.equal(response.status, 200)
assert.equal(response.headers.get('cache-control'), 'no-store')
assert.equal((await response.json()).displayStatus, '未验证／待补充')
assert.deepEqual(capturedQuery, {
  where: {
    platformId: 'instagram',
    handle: { equals: 'unknown_account', mode: 'insensitive' },
    unboundAt: null,
  },
  select: {
    displayName: true,
    followerCount: true,
    profileUrl: true,
    snapshotAt: true,
    followerCountUpdatedAt: true,
  },
  orderBy: [
    { followerCountUpdatedAt: { sort: 'desc', nulls: 'last' } },
    { snapshotAt: { sort: 'desc', nulls: 'last' } },
    { updatedAt: 'desc' },
  ],
})

databaseAccount = {
  displayName: 'Recorded Account',
  followerCount: 0,
  profileUrl: null,
  snapshotAt: new Date('2026-09-01T00:00:00.000Z'),
  followerCountUpdatedAt: null,
}
response = await handler.GET(new Request('http://localhost/api/integrations/social/public-profile?platform=facebook&handle=recorded_account'))
const recordedResponse = await response.json()
assert.equal(recordedResponse.followerCount, 0)
assert.equal(recordedResponse.source, 'database_record')
assert.equal(recordedResponse.verificationStatus, 'UNVERIFIED')

response = await handler.GET(new Request('http://localhost/api/integrations/social/public-profile?platform=instagram&handle=%40%40'))
assert.equal(response.status, 400)

console.log('public social profile truthfulness tests passed')
