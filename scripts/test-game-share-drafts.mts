import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  GAME_SHARE_BRAND_DAILY_AI_LIMIT,
  GAME_SHARE_IP_DAILY_AI_LIMIT,
  GAME_SHARE_SESSION_LIMIT,
  buildFallbackDrafts,
  enabledSharePlatforms,
  getBusinessDate,
  normalizeExperienceInput,
  parseGeneratedDrafts,
} from '../src/lib/gameShareDrafts.ts'

assert.equal(GAME_SHARE_SESSION_LIMIT, 3)
assert.equal(GAME_SHARE_IP_DAILY_AI_LIMIT, 60)
assert.equal(GAME_SHARE_BRAND_DAILY_AI_LIMIT, 300)

assert.ok(normalizeExperienceInput({ locale: 'en', experienceTags: [], experienceNote: '' }).error)
assert.ok(normalizeExperienceInput({ locale: 'zh', experienceTags: ['OTHER'], experienceNote: '' }).error)
assert.ok(normalizeExperienceInput({ locale: 'en', experienceTags: ['SERVICE', 'VALUE', 'SPEED', 'AMBIENCE'], experienceNote: '' }).error)
assert.ok(normalizeExperienceInput({ locale: 'en', experienceTags: ['SERVICE'], experienceNote: 'x'.repeat(241) }).error)
assert.deepEqual(
  normalizeExperienceInput({ locale: 'zh', experienceTags: ['SERVICE', 'SERVICE', 'OTHER'], experienceNote: '店员耐心说明了流程' }),
  { locale: 'zh', experienceTags: ['SERVICE', 'OTHER'], experienceNote: '店员耐心说明了流程' },
)

assert.deepEqual(enabledSharePlatforms({ taskGoogleMapsEnabled: true, taskXiaohongshuEnabled: false, taskInstagramEnabled: true }), ['GOOGLE', 'INSTAGRAM'])

const fallback = buildFallbackDrafts({
  brandName: 'Test Cafe',
  locale: 'en',
  experienceTags: ['FOOD_DRINK', 'SERVICE'],
  experienceNote: 'The tea tasted fresh.',
  platforms: ['GOOGLE', 'XIAOHONGSHU', 'INSTAGRAM'],
})
assert.equal(Object.keys(fallback).length, 3)
assert.doesNotMatch(fallback.GOOGLE || '', /#|reward|discount|free item/i)
assert.ok(((fallback.XIAOHONGSHU || '').match(/#/g) || []).length <= 5)
assert.ok(((fallback.INSTAGRAM || '').match(/#/g) || []).length <= 5)

assert.deepEqual(
  parseGeneratedDrafts(JSON.stringify({ drafts: {
    GOOGLE: 'A concise description #RemoveThis',
    INSTAGRAM: 'A short visit note #one #two #three #four #five #six',
  } }), ['GOOGLE', 'INSTAGRAM']),
  {
    GOOGLE: 'A concise description',
    INSTAGRAM: 'A short visit note #one #two #three #four #five',
  },
)
assert.equal(parseGeneratedDrafts('{bad json', ['GOOGLE']), null)
assert.equal(parseGeneratedDrafts(JSON.stringify({ drafts: { GOOGLE: 'Post this five-star review for a reward' } }), ['GOOGLE']), null)
assert.equal(getBusinessDate('Asia/Singapore', new Date('2026-08-05T16:30:00.000Z')), '2026-08-06')
assert.equal(getBusinessDate('Invalid/Timezone', new Date('2026-08-05T16:30:00.000Z')), '2026-08-06')

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const [shareRoute, taskRoute, overrideRoute, statusRoute, client, schema, migration, prd] = await Promise.all([
  readFile(`${repoRoot}/src/app/api/game/share-drafts/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/tasks/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/tasks/override/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/status/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/game/[brandId]/CustomerGameClient.tsx`, 'utf8'),
  readFile(`${repoRoot}/prisma/schema.prisma`, 'utf8'),
  readFile(`${repoRoot}/prisma/migrations/20260806120000_add_game_share_drafts/migration.sql`, 'utf8'),
  readFile(`${repoRoot}/docs/prd-aivue.md`, 'utf8'),
])

assert.match(shareRoute, /TransactionIsolationLevel\.Serializable/)
assert.match(shareRoute, /callLLM\('copywriting'/)
assert.match(shareRoute, /sessionLimited[\s\S]*?draftResponse/)
assert.match(shareRoute, /source = 'fallback'/)
assert.match(taskRoute, /requestedTaskType === 'REVIEW_SUBMIT'/)
assert.match(taskRoute, /const taskType = 'EXPERIENCE_FEEDBACK'/)
assert.match(taskRoute, /sessionId_taskType_rewardDate/)
assert.match(overrideRoute, /updateMany/)
assert.match(overrideRoute, /status: \{ not: 'APPROVED' \}/)
assert.match(statusRoute, /todayFeedbackSubmission/)
assert.match(client, /amc-game-share-draft-edits:\$\{brandId\}/)
assert.match(client, /setShareDrafts\(localEdits\?\.draftId === draftData\.draftId/)
assert.match(client, /Public posting is not required|公开发布不是领取积分的条件/)
assert.match(schema, /model GameShareDraft/)
assert.match(schema, /@@unique\(\[sessionId, taskType, rewardDate\]\)/)
assert.match(migration, /ROW_NUMBER\(\) OVER/)
assert.match(migration, /merchant-authored poster copy is preserved/)
assert.doesNotMatch(prd, /uploading photo evidence|review screenshot/i)

console.log('Game experience feedback and AI sharing-draft contract passed.')
