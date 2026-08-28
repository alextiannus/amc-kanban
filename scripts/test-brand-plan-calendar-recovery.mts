import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  executeCalendarRecoveryTargets,
  inspectCalendarInspirationIdentity,
  minimumCompleteCalendarMonthValue,
  selectCalendarRecoveryTargets,
  type CalendarRecoveryCheckpointEntry,
} from '../src/lib/brand-plan/calendarRecovery.ts'

assert.equal(minimumCompleteCalendarMonthValue(new Date('2026-08-27T00:00:00Z')), '2026-09')

const targets = selectCalendarRecoveryTargets({
  minimumMonth: '2026-09',
  brands: [{
    brandId: 'brand-1',
    brandName: '成都滋味烤鱼',
    publishingFreq: { platforms: { tiktok: { postsPerWeek: 1 } } },
    marketingSolution: {
      publishingCalendar: {
        generatedAt: '2026-08-20T00:00:00.000Z',
        months: {
          '2026-08': [{ id: 'past', inspirationCreativeId: 'cre_ins_past' }],
          '2026-09': [{
            id: 'future',
            title: '现烤鱼皮特写',
            planning: '灵感主题：现烤鱼皮特写\n灵感核心：鱼皮在炉中滋滋冒油',
            inspirationCreativeId: 'cre_ins_wrong',
            inspirationSourceTitle: '现烤鱼皮特写',
            inspirationSourceSummary: '鱼皮在炉中滋滋冒油',
            sampleVideoUrl: 'https://obs.example/content-library/SG/fb/ins_right/original/video.mp4',
          }],
        },
      },
    },
  }],
})

assert.equal(targets.length, 1)
assert.equal(targets[0].month, '2026-09')
assert.deepEqual(targets[0].inspection.issues.map((issue) => issue.code), ['media_creative_mismatch'])

const invalidInspection = inspectCalendarInspirationIdentity([
  { id: 'duplicate', inspirationCreativeId: '' },
  { id: 'duplicate', inspirationCreativeId: 'bad' },
])
assert.deepEqual(invalidInspection.issues.map((issue) => issue.code), [
  'missing_creative_id',
  'invalid_creative_id',
  'duplicate_item_id',
])

const sourceMismatchInspection = inspectCalendarInspirationIdentity([{
  id: 'source-mismatch',
  title: '通用模板标题',
  planning: '通用策划内容',
  inspirationCreativeId: 'cre_ins_right',
  inspirationSourceTitle: '现烤鱼皮特写',
  inspirationSourceSummary: '鱼皮在炉中滋滋冒油',
}])
assert.deepEqual(sourceMismatchInspection.issues.map((issue) => issue.code), [
  'source_title_mismatch',
  'source_planning_mismatch',
])

const operationOrder: string[] = []
const checkpoints: CalendarRecoveryCheckpointEntry[] = []
let generationAttempts = 0
const validItems = [{
  id: 'future',
  status: '待确认',
  title: '现烤鱼皮特写',
  planning: '灵感主题：现烤鱼皮特写\n灵感核心：鱼皮在炉中滋滋冒油',
  inspirationCreativeId: 'cre_ins_right',
  inspirationSourceTitle: '现烤鱼皮特写',
  inspirationSourceSummary: '鱼皮在炉中滋滋冒油',
  sampleVideoUrl: 'https://obs.example/content-library/SG/fb/ins_right/original/video.mp4',
}]

const dryRunResult = await executeCalendarRecoveryTargets({
  targets,
  apply: false,
  operations: {
    async prepare() { throw new Error('dry_run_must_not_prepare') },
    async generate() { throw new Error('dry_run_must_not_generate') },
    async verify() { throw new Error('dry_run_must_not_verify') },
    async checkpoint() { throw new Error('dry_run_must_not_checkpoint') },
  },
})
assert.deepEqual(dryRunResult, { planned: 1, completed: 0, skipped: 0, failed: 0 })

const applyResult = await executeCalendarRecoveryTargets({
  targets,
  apply: true,
  maxAttempts: 2,
  operations: {
    async prepare(target) {
      operationOrder.push('backup')
      return { target, backup: { version: 3 } }
    },
    async generate() {
      operationOrder.push('generate')
      generationAttempts += 1
      if (generationAttempts === 1) throw new Error('temporary_content_failure')
      return validItems
    },
    async verify() {
      operationOrder.push('verify')
      return { version: 4 }
    },
    async checkpoint(entry) {
      operationOrder.push('checkpoint')
      checkpoints.push(entry)
    },
  },
})
assert.deepEqual(operationOrder, ['backup', 'generate', 'generate', 'verify', 'checkpoint'])
assert.deepEqual(applyResult, { planned: 1, completed: 1, skipped: 0, failed: 0 })
assert.equal(checkpoints[0].status, 'completed')
assert.equal(checkpoints[0].attempts, 2)

const resumedResult = await executeCalendarRecoveryTargets({
  targets,
  apply: true,
  completedKeys: [targets[0].key],
  operations: {
    async prepare() { throw new Error('completed_target_must_be_skipped') },
    async generate() { throw new Error('completed_target_must_be_skipped') },
    async verify() { throw new Error('completed_target_must_be_skipped') },
    async checkpoint() { throw new Error('completed_target_must_be_skipped') },
  },
})
assert.deepEqual(resumedResult, { planned: 1, completed: 0, skipped: 1, failed: 0 })

const failedCheckpoints: CalendarRecoveryCheckpointEntry[] = []
await assert.rejects(executeCalendarRecoveryTargets({
  targets,
  apply: true,
  maxAttempts: 2,
  operations: {
    async prepare(target) { return { target, backup: { version: 5 } } },
    async generate() { throw new Error('content_unavailable') },
    async verify() { throw new Error('failed_generation_must_not_verify') },
    async checkpoint(entry) { failedCheckpoints.push(entry) },
  },
}), /content_unavailable/)
assert.equal(failedCheckpoints[0].status, 'failed')
assert.equal(failedCheckpoints[0].attempts, 2)

const [serviceSource, recoveryScriptSource, packageSource] = await Promise.all([
  readFile(new URL('../src/lib/brand-plan/service.ts', import.meta.url), 'utf8'),
  readFile(new URL('./recover-brand-plan-calendars.mts', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
])
assert(serviceSource.includes('requireValidCalendarInspirationIdentity(reviewedItems)'))
assert(serviceSource.includes('calendar creative review returned mismatched item ids'))
assert(!serviceSource.includes('byId.get(item.id) || reviewed[index]'))
assert(serviceSource.includes('requirePersistedCreative: true'))
assert(serviceSource.includes("new BrandPlanError('calendar_content_creative_match_failed', 502, { reason })"))
assert(serviceSource.includes("'calendar_content_creative_missing',"))
assert(serviceSource.includes('missingPromotionPoints,'))
assert(serviceSource.includes('const explicitCreativeId = text(candidate?.inspirationCreativeId)'))
assert(!serviceSource.includes('return inspirationId ? `cre_${inspirationId}` : undefined'))
assert(serviceSource.includes('inspirationSourceTitle: inspirationSource.title'))
assert(serviceSource.includes('title: item.title'))
assert(serviceSource.includes('planning: item.planning'))
assert(serviceSource.includes('materialRequirements: item.materialRequirements'))
assert(serviceSource.indexOf('const mediaCreativeId = resolveInspirationCreativeId') < serviceSource.indexOf("stringList(candidate?.matchedCreatives).find"))
assert(recoveryScriptSource.indexOf('await saveRecoveryBackup(target)') < recoveryScriptSource.indexOf("action: 'generate_publishing_calendar'"))
assert(recoveryScriptSource.includes("generationMode: 'MANUAL_EDIT'"))
assert(recoveryScriptSource.includes("snapshotType: 'BEFORE_REGENERATION'"))
assert(recoveryScriptSource.includes('--apply requires --checkpoint=<durable-json-path>.'))
const packageJson = JSON.parse(packageSource)
assert.equal(packageJson.scripts['brand-plan:recover-calendars:dry-run'], 'tsx scripts/recover-brand-plan-calendars.mts --dry-run')
assert.equal(packageJson.dependencies.tsx, '^4.23.12')

console.log('Brand plan calendar recovery tests passed')
