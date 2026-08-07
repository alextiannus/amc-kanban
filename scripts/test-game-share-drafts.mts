import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  GAME_SHARE_BRAND_DAILY_AI_LIMIT,
  GAME_SHARE_IP_DAILY_AI_LIMIT,
  GAME_SHARE_SESSION_LIMIT,
  buildBrandIntroFallbackDrafts,
  buildBrandIntroPrompt,
  buildFallbackDrafts,
  buildGameSharePrompt,
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

const brandIntroFallback = buildBrandIntroFallbackDrafts({
  brandName: 'Test Cafe',
  brandLocation: 'Singapore',
  locale: 'en',
  platforms: ['GOOGLE', 'XIAOHONGSHU', 'INSTAGRAM'],
})
assert.equal(brandIntroFallback.GOOGLE, undefined, 'brand facts must never generate a Google customer review')
assert.ok(brandIntroFallback.XIAOHONGSHU)
assert.ok(brandIntroFallback.INSTAGRAM)
assert.doesNotMatch(`${brandIntroFallback.XIAOHONGSHU} ${brandIntroFallback.INSTAGRAM}`, /I (?:visited|ordered|tried|recommend)/i)
assert.match(
  buildBrandIntroPrompt({ brandName: 'Test Cafe', brandLocation: null, brandDescription: 'Neighbourhood cafe', menuNames: [], locale: 'en', platforms: ['XIAOHONGSHU'] }),
  /Do not write a customer review/,
)
const googleExpansionPrompt = buildGameSharePrompt({
  brandName: 'Test Cafe',
  brandLocation: 'Singapore',
  brandDescription: 'A neighbourhood tea house',
  menuNames: ['Jasmine tea'],
  locale: 'zh',
  experienceTags: ['OTHER'],
  experienceNote: '这个商家不错',
  platforms: ['GOOGLE'],
})
assert.match(googleExpansionPrompt, /A neighbourhood tea house/)
assert.match(googleExpansionPrompt, /Jasmine tea/)
assert.match(googleExpansionPrompt, /这个商家不错/)

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
assert.match(shareRoute, /body\.mode === 'BRAND_INTRO'/)
assert.match(shareRoute, /platform !== 'GOOGLE'/)
assert.match(shareRoute, /buildBrandIntroPrompt/)
assert.match(shareRoute, /description: true/)
assert.match(shareRoute, /brandDescription: context\.brand\.description/)
assert.match(taskRoute, /requestedTaskType === 'REVIEW_SUBMIT'/)
assert.match(taskRoute, /const taskType = 'EXPERIENCE_FEEDBACK'/)
assert.match(taskRoute, /sessionId_taskType_rewardDate/)
assert.match(overrideRoute, /updateMany/)
assert.match(overrideRoute, /status: \{ not: 'APPROVED' \}/)
assert.match(statusRoute, /todayFeedbackSubmission/)
assert.match(client, /amc-game-share-draft-edits:\$\{brandId\}/)
assert.match(client, /setShareDrafts\(localEdits\?\.draftId === draftData\.draftId/)
assert.match(client, /window\.navigator\.language/)
assert.match(client, /locale === 'zh' \? '这个商家不错' : 'This business is good\.'/)
assert.match(client, /mode: 'BRAND_INTRO'/)
assert.match(client, /mode: 'EXPERIENCE'/)
assert.match(client, /window\.setTimeout\(\(\) => \{[\s\S]*?\}, 800\)/)
assert.doesNotMatch(client, /id="experience-note"/)
assert.doesNotMatch(client, /Draft language|文案语言/)
assert.doesNotMatch(client, /AI helps me write sharing drafts|AI 帮我写分享文案/)
assert.match(client, /Public posting is not required|公开发布不是领取积分的条件/)
assert.match(schema, /model GameShareDraft/)
assert.match(schema, /@@unique\(\[sessionId, taskType, rewardDate\]\)/)
assert.match(migration, /ROW_NUMBER\(\) OVER/)
assert.match(migration, /merchant-authored poster copy is preserved/)
assert.doesNotMatch(prd, /uploading photo evidence|review screenshot/i)
assert.match(prd, /Google Review input is hidden/)

console.log('Game experience feedback and AI sharing-draft contract passed.')
