import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  buildAutoShareFallbackDrafts,
  buildAutoSharePoolPrompt,
  enabledSharePlatforms,
  parseGeneratedDraftBundles,
} from '../src/lib/gameShareDrafts.ts'

const platforms = enabledSharePlatforms({
  taskGoogleMapsEnabled: true,
  taskXiaohongshuEnabled: true,
  taskInstagramEnabled: true,
})
assert.deepEqual(platforms, ['GOOGLE', 'XIAOHONGSHU', 'INSTAGRAM'])

const fallback = buildAutoShareFallbackDrafts({
  brandName: 'Test Cafe',
  brandLocation: 'Singapore',
  locale: 'en',
  platforms,
})
assert.deepEqual(Object.keys(fallback), platforms)
assert.doesNotMatch(Object.values(fallback).join(' '), /reward|points|lottery|discount|five[- ]star/i)
assert.doesNotMatch(fallback.GOOGLE || '', /#/)

const prompt = buildAutoSharePoolPrompt({
  brandName: 'Test Cafe',
  brandLocation: 'Singapore',
  brandDescription: 'Neighbourhood tea house',
  menuNames: ['Jasmine tea'],
  locale: 'en',
  platforms,
  bundleCount: 2,
})
assert.match(prompt, /2 distinct/i)
assert.match(prompt, /never claim a customer ordered, tasted, liked, bought/i)
assert.match(prompt, /Do not mention a lottery, points, rewards/i)
assert.match(prompt, /"bundles"/)

const parsedBundles = parseGeneratedDraftBundles(JSON.stringify({ bundles: [
  { drafts: {
    GOOGLE: 'A concise visit description #RemoveThis',
    XIAOHONGSHU: 'A short visit note #one',
    INSTAGRAM: 'A recent visit note #one #two',
  } },
  { drafts: {
    GOOGLE: 'A different concise visit description',
    XIAOHONGSHU: 'Another short visit note #two',
    INSTAGRAM: 'Another recent visit note #three',
  } },
] }), platforms, 2)
assert.equal(parsedBundles?.length, 2)
assert.equal(parsedBundles?.[0].GOOGLE, 'A concise visit description')
assert.equal(parseGeneratedDraftBundles(JSON.stringify({ bundles: [
  { drafts: { GOOGLE: 'Same', XIAOHONGSHU: 'Same', INSTAGRAM: 'Same' } },
  { drafts: { GOOGLE: 'Same', XIAOHONGSHU: 'Same', INSTAGRAM: 'Same' } },
] }), platforms, 2), null)

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const [publicRoute, poolRoute, poolLib, rewardRoute, client, schema, migration, dashboard, prd, apiDocs] = await Promise.all([
  readFile(`${repoRoot}/src/app/api/game/share-drafts/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/share-draft-pool/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/lib/gameShareDraftPool.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/entry-reward/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/game/[brandId]/CustomerGameClient.tsx`, 'utf8'),
  readFile(`${repoRoot}/prisma/schema.prisma`, 'utf8'),
  readFile(`${repoRoot}/prisma/migrations/20260807193000_add_game_share_draft_pool/migration.sql`, 'utf8'),
  readFile(`${repoRoot}/src/components/dashboard/GameSettingsDashboard.tsx`, 'utf8'),
  readFile(`${repoRoot}/docs/prd-aivue.md`, 'utf8'),
  readFile(`${repoRoot}/docs/API_SERVICES.md`, 'utf8'),
])

assert.match(publicRoute, /export async function GET/)
assert.doesNotMatch(publicRoute, /export async function POST/)
assert.doesNotMatch(publicRoute, /callLLM/)
assert.match(publicRoute, /leaseGameShareDraftBundle/)
assert.match(publicRoute, /buildAutoShareFallbackDrafts/)
assert.match(publicRoute, /code: 'ACTIVITY_INACTIVE'/)
assert.match(publicRoute, /after\(async/)

assert.match(poolLib, /GAME_SHARE_POOL_TARGET = 5/)
assert.match(poolLib, /GAME_SHARE_DRAFT_LEASE_MS = 15 \* 60 \* 1000/)
assert.match(poolLib, /TransactionIsolationLevel\.Serializable/)
assert.match(poolLib, /status: 'RESERVED'/)
assert.match(poolLib, /status: 'AVAILABLE'/)
assert.match(poolLib, /buildAutoSharePoolPrompt/)
assert.match(poolLib, /generationStatus: 'ERROR'/)

assert.match(rewardRoute, /draftId/)
assert.match(rewardRoute, /status: 'USED'/)
assert.match(rewardRoute, /pointsBalance: \{ increment: 5 \}/)
assert.match(rewardRoute, /TransactionIsolationLevel\.Serializable/)
assert.match(rewardRoute, /DRAFT_RESERVATION_INVALID/)
assert.match(rewardRoute, /requestGameShareDraftPoolRefill/)

assert.match(client, /立即评价，获取积分抽奖/)
assert.match(client, /Review now, earn points, and spin to win/)
assert.doesNotMatch(client, /Prepare your sharing draft/)
assert.doesNotMatch(client, /truthConfirm|generationsLeft|fallbackNotice/)
assert.doesNotMatch(client, /config\?\.description &&/)
assert.match(client, /draftId: shareDraftId/)
assert.match(client, /<textarea/)
assert.match(client, /setInterval\(renew, 5 \* 60 \* 1000\)/)

assert.match(schema, /model GameShareDraftPoolItem/)
assert.match(schema, /model GameShareDraftPoolState/)
assert.match(schema, /@@unique\(\[gameConfigId, locale\]\)/)
assert.match(migration, /CREATE TABLE "GameShareDraftPoolItem"/)
assert.match(migration, /CREATE TABLE "GameShareDraftPoolState"/)
assert.match(poolRoute, /canOwnBrand/)
assert.match(poolRoute, /status: 202/)
assert.match(dashboard, /AI 评价文案池/)
assert.match(dashboard, /补充至 5 组/)
assert.match(prd, /public request path never waits for an LLM/i)
assert.match(apiDocs, /公开路径绝不调用 LLM/)

console.log('Game pre-generated bilingual sharing-draft pool contract passed.')
