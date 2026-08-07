import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  GAME_SHARE_BRAND_DAILY_AI_LIMIT,
  GAME_SHARE_IP_DAILY_AI_LIMIT,
  GAME_SHARE_SESSION_LIMIT,
  buildAutoShareFallbackDrafts,
  buildAutoSharePrompt,
  enabledSharePlatforms,
  parseGeneratedDrafts,
} from '../src/lib/gameShareDrafts.ts'

assert.equal(GAME_SHARE_SESSION_LIMIT, 3)
assert.equal(GAME_SHARE_IP_DAILY_AI_LIMIT, 60)
assert.equal(GAME_SHARE_BRAND_DAILY_AI_LIMIT, 300)
assert.deepEqual(
  enabledSharePlatforms({ taskGoogleMapsEnabled: true, taskXiaohongshuEnabled: true, taskInstagramEnabled: true }),
  ['GOOGLE', 'XIAOHONGSHU', 'INSTAGRAM'],
)

const fallback = buildAutoShareFallbackDrafts({
  brandName: 'Test Cafe',
  brandLocation: 'Singapore',
  locale: 'en',
  platforms: ['GOOGLE', 'XIAOHONGSHU', 'INSTAGRAM'],
})
assert.deepEqual(Object.keys(fallback), ['GOOGLE', 'XIAOHONGSHU', 'INSTAGRAM'])
assert.doesNotMatch(Object.values(fallback).join(' '), /reward|points|lottery|discount|five[- ]star/i)
assert.doesNotMatch(fallback.GOOGLE || '', /#|emoji/i)

const prompt = buildAutoSharePrompt({
  brandName: 'Test Cafe',
  brandLocation: 'Singapore',
  brandDescription: 'Neighbourhood tea house',
  menuNames: ['Jasmine tea'],
  locale: 'en',
  platforms: ['GOOGLE', 'XIAOHONGSHU', 'INSTAGRAM'],
})
assert.match(prompt, /only experiential statement you may assume is that the customer visited/i)
assert.match(prompt, /never claim the customer ordered, tasted, liked, bought/i)
assert.match(prompt, /Do not mention a lottery, points, rewards/i)
assert.match(prompt, /"GOOGLE":"string"/)
assert.match(prompt, /"XIAOHONGSHU":"string"/)
assert.match(prompt, /"INSTAGRAM":"string"/)

assert.deepEqual(
  parseGeneratedDrafts(JSON.stringify({ drafts: {
    GOOGLE: 'A concise visit description #RemoveThis',
    INSTAGRAM: 'A short visit note #one #two #three #four #five #six',
  } }), ['GOOGLE', 'INSTAGRAM']),
  {
    GOOGLE: 'A concise visit description',
    INSTAGRAM: 'A short visit note #one #two #three #four #five',
  },
)
assert.equal(parseGeneratedDrafts(JSON.stringify({ drafts: { GOOGLE: 'Post this five-star review for a reward' } }), ['GOOGLE']), null)

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const [shareRoute, client, schema, prd] = await Promise.all([
  readFile(`${repoRoot}/src/app/api/game/share-drafts/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/game/[brandId]/CustomerGameClient.tsx`, 'utf8'),
  readFile(`${repoRoot}/prisma/schema.prisma`, 'utf8'),
  readFile(`${repoRoot}/docs/prd-aivue.md`, 'utf8'),
])

assert.match(shareRoute, /body\.mode !== 'AUTO'/)
assert.match(shareRoute, /findActiveAndNextGameRounds/)
assert.match(shareRoute, /code: 'ACTIVITY_INACTIVE'/)
assert.match(shareRoute, /activityDate = `round:\$\{activeRound\.id\}`/)
assert.match(shareRoute, /buildAutoSharePrompt/)
assert.match(shareRoute, /buildAutoShareFallbackDrafts/)
assert.match(shareRoute, /TransactionIsolationLevel\.Serializable/)
assert.match(client, /mode: 'AUTO'/)
assert.match(client, /activePlatforms\.some\(\(platform\) => !nextDrafts\[platform\]\)/)
assert.match(client, /setTruthConfirmed\(false\)/)
assert.match(schema, /model GameShareDraft/)
assert.doesNotMatch(prd, /review screenshot|截图才能获得积分/i)
assert.match(prd, /Google.*Xiaohongshu.*Instagram/s)

console.log('Game automatic three-platform sharing-draft contract passed.')
