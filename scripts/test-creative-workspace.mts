import assert from 'node:assert/strict'
import * as requireCrypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { normalizeCreativeWorkspaceItem, validateCreativeWorkspacePatch, validateCreativeRevisionClientPatch } from '../src/lib/brand-plan/creativeWorkspaceContract.ts'
import * as revisionContract from '../src/lib/brand-plan/creativeRevisionContract.ts'

const undated = normalizeCreativeWorkspaceItem({ id: 'idea-1', title: 'A', planning: 'B' })
assert.equal(undated.schedule, null)
assert.equal(undated.status, 'idea_pending')
assert.deepEqual(undated.platformTargets, [])
assert.equal(undated.legacy, undefined)
assert.equal(validateCreativeWorkspacePatch({ planning: 'new script' }).planning, 'new script')
assert.deepEqual(validateCreativeWorkspacePatch({ platformTargets: ['Instagram', 'TikTok'], status: 'ready' }), { platformTargets: ['Instagram', 'TikTok'], status: 'ready' })
assert.throws(() => validateCreativeWorkspacePatch({ date: '2026-11-01' }), /invalid_creative_patch/)
assert.throws(() => validateCreativeWorkspacePatch({ status: 'planned_unimplemented' }), /invalid_creative_patch/)
assert.throws(() => validateCreativeWorkspacePatch({ schedule: { draftId: 'forged' } }), /invalid_creative_patch/)
assert.throws(() => validateCreativeWorkspacePatch({ source: { inspirationCreativeId: 'forged' } }), /invalid_creative_patch/)

const legacy = normalizeCreativeWorkspaceItem({ id: 'legacy', date: '2026-11-01', platform: 'Instagram', status: 'planned_unimplemented' })
assert.equal(legacy.legacy?.date, '2026-11-01')
assert.equal(legacy.legacy?.platform, 'Instagram')
assert.equal(legacy.legacy?.status, 'planned_unimplemented')
assert.equal(legacy.schedule, null)
assert.deepEqual(legacy.platformTargets, ['Instagram'])

const linked = normalizeCreativeWorkspaceItem({ id: 'linked', schedule: { draftId: 'draft-1', scheduledAt: '2026-11-01T10:00:00Z', platform: 'Instagram', scheduledBy: 'owner', scheduledAtRevisionId: 'revision-1' } })
assert.equal(linked.schedule?.draftId, 'draft-1')
assert.equal(linked.legacy, undefined)
const legacyClient = validateCreativeRevisionClientPatch({ date: '2026-11-01', title: 'A', platform: 'Instagram', contentType: '图文', product: 'Lunch', planning: 'B', materialRequirements: [], aiCaption: '', aiTags: [] }, '2026-11')
assert.deepEqual(legacyClient.patch.platformTargets, ['Instagram'])
assert.equal(legacyClient.legacyProduct, 'Lunch')
assert.equal('date' in legacyClient.patch, false)
assert.throws(() => validateCreativeRevisionClientPatch({ date: '2026-11-01' }, '2026-11'), /invalid_creative_patch/)
assert.throws(() => validateCreativeWorkspacePatch({ date: '' }), /invalid_creative_patch/)
const undatedEditorPatch = { date: '', title: 'Undated title', platform: '', contentType: '图文', product: '', planning: 'Editor update', materialRequirements: [], aiCaption: '', aiTags: [] }
assert.equal(validateCreativeRevisionClientPatch(undatedEditorPatch, '2026-11').patch.planning, 'Editor update')
assert.throws(() => validateCreativeRevisionClientPatch({ date: '', planning: 'partial forged legacy request' }, '2026-11'), /invalid_creative_patch/)
assert.throws(() => validateCreativeRevisionClientPatch({ ...undatedEditorPatch, schedule: { draftId: 'forged' } }, '2026-11'), /invalid_creative_patch/)
const editedLegacy = normalizeCreativeWorkspaceItem({ id: 'legacy', legacy: { date: '2026-11-01', platform: 'Instagram', status: 'planned_unimplemented' }, status: 'idea_pending', platformTargets: ['TikTok'] })
assert.equal(editedLegacy.legacy?.date, '2026-11-01')
assert.equal(editedLegacy.legacy?.status, 'planned_unimplemented')
assert.deepEqual(editedLegacy.platformTargets, ['TikTok'])
process.env.DATABASE_URL ||= 'postgresql://local@127.0.0.1:5432/amc_lineage_test_contract'
const { calendarCreativeOption, listOpenCalendarCreativeOptions, syncConfirmedCalendarItemsToDrafts } = await import('../src/lib/brand-plan/calendarSync.ts')
assert.equal(calendarCreativeOption({ id: 'undated', title: 'A', status: 'idea_pending' })?.id, 'undated')
assert.equal(calendarCreativeOption({ id: 'legacy', title: 'A', legacy: { date: '2026-11-01', platform: 'Instagram' }, status: 'idea_pending' })?.date, '2026-11-01')
const draftCalls: string[] = []
const previousDraft = { id: 'existing-draft', caption: 'Keep me' }
const db = { contentDraft: { create: () => draftCalls.push('create'), upsert: () => draftCalls.push('upsert'), update: () => draftCalls.push('update'), delete: () => draftCalls.push('delete') } }
assert.deepEqual(await syncConfirmedCalendarItemsToDrafts('brand-1', '2026-11', [{ id: 'legacy', date: '2026-11-01', platform: 'Instagram', status: 'planned_unimplemented' }], db as any), { syncedCount: 0 })
assert.deepEqual(await syncConfirmedCalendarItemsToDrafts('brand-1', '2026-11', [{ id: 'undated', title: 'A', status: 'idea_pending' }], db as any), { syncedCount: 0 })
assert.deepEqual(draftCalls, [])
assert.deepEqual(previousDraft, { id: 'existing-draft', caption: 'Keep me' })
const listDb = {
  brandKnowledge: { findUnique: async () => ({ marketingSolution: { publishingCalendar: { months: { '2026-11': [
    { id: 'undated', title: 'New idea', status: 'idea_pending', platformTargets: ['TikTok'] },
    { id: 'legacy', title: 'Edited old idea', status: 'idea_pending', legacy: { date: '2026-11-01', platform: 'Instagram', status: 'planned_unimplemented' } },
  ] } } } }) },
  brandMarketingSolution: { findMany: async () => [{ id: 'revision-new', period: revisionContract.revisionPeriod('2026-11', 'undated'), createdAt: new Date('2026-11-02T00:00:00Z') }] },
  contentDraft: { findMany: async () => [{ id: previousDraft.id, agentNote: 'brand-plan-calendar-item:undated', status: 'draft' }] },
}
const listed = await listOpenCalendarCreativeOptions('brand-1', '2026-11', listDb as any)
assert.deepEqual(listed.map(item => item.id).sort(), ['legacy', 'undated'])
assert.equal(listed.find(item => item.id === 'undated')?.date, null)
assert.equal(listed.find(item => item.id === 'undated')?.draftId, null)
assert.equal(listed.find(item => item.id === 'undated')?.workspaceItem?.currentRevisionId, 'revision-new')
assert.equal(listed.find(item => item.id === 'legacy')?.workspaceItem?.legacy?.date, '2026-11-01')
listDb.contentDraft.findMany=async()=>[
  {id:'legacy-draft',agentNote:'Historical BRAND-PLAN-CALENDAR-ITEM:LEGACY',status:'draft'},
  {id:'other-draft',agentNote:'brand-plan-calendar-item:legacy-other',status:'draft'},
  {id:'dotted-draft',agentNote:'Historical BRAND-PLAN-CALENDAR-ITEM:LEGACY.V1',status:'draft'},
]
const historicalListed=await listOpenCalendarCreativeOptions('brand-1','2026-11',listDb as any)
assert.equal(historicalListed.find(item=>item.id==='legacy')?.draftId,'legacy-draft')

// Exercise the authorized revision read path with a precise persistence mock:
// a historical-page query must still project the actual current revision ID.
const current = { id: 'idea-1', brandId: 'brand-1', title: 'Edited', planning: 'Current', status: 'idea_pending', legacy: { date: '2026-11-01', platform: 'Instagram', status: 'planned_unimplemented' } }
const rows = [
  { id: 'revision-1', version: 1, createdAt: new Date('2026-11-02T00:00:00Z'), input: { brand: { id: 'brand-1' } }, output: current },
  { id: 'revision-0', version: 0, createdAt: new Date('2026-11-01T00:00:00Z'), input: { brand: { id: 'brand-1' } }, output: { id: 'idea-1', date: '2026-11-01', platform: 'Instagram', status: 'planned_unimplemented' } },
]
const deps: Record<string, any> = {
  './matchingContract': {}, './revisionFeedback': { validateCreativeFeedback: () => null, creativeChanges: () => [] }, '../ai-native/creative-diversity.ts': {},
  '../prisma.ts': { prisma: {} }, '../ai-native/facts.ts': {},
  '../role-permissions/store.ts': {}, '../role-permissions/contract.ts': {},
  '../auth-v2/types.ts': { principalFromUser: () => ({ globalRoles: ['ADMIN'] }) },
  '../user-management/brandAccess.ts': { canUserAccessBrand: async () => true },
  './creativeRevisionContract.ts': revisionContract,
  './creativeWorkspaceContract.ts': await import('../src/lib/brand-plan/creativeWorkspaceContract.ts'),
  './creativeCollections.ts': {},
}
const module = { exports: {} as any }
new Function('require', 'module', 'exports', ts.transpileModule(readFileSync('src/lib/brand-plan/creativeRevisions.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(
  (key: string) => { if (key === 'node:crypto') return requireCrypto; assert.ok(key in deps, `Unexpected dependency: ${key}`); return deps[key] }, module, module.exports,
)
const dbMock = {
  user: { findUnique: async () => ({ id: 'owner', status: 'ACTIVE', nickname: 'Owner' }) },
  brandKnowledge: { findUnique: async () => ({ marketingSolution: { publishingCalendar: { months: { '2026-11': [current] } } } }) },
  brandMarketingSolution: {
    findMany: async ({ where }: any) => rows.filter(row => (!where.id || row.id === where.id) && (!where.version || row.version < where.version.lt)),
    findFirst: async () => rows[0],
  },
  brand: { findUnique: async () => ({ id: 'brand-1', name: 'Brand' }) },
}
const actor = { id: 'owner', type: 'HUMAN' }
const full = await module.exports.readCreativeRevisions(actor, 'brand-1', '2026-11', 'idea-1', undefined, dbMock)
assert.equal(full.workspaceItem.currentRevisionId, 'revision-1')
assert.equal(full.workspaceItem.legacy.date, '2026-11-01')
assert.equal(full.revisions[1].workspaceItem.currentRevisionId, 'revision-0')
const historical = await module.exports.readCreativeRevisions(actor, 'brand-1', '2026-11', 'idea-1', 'revision-0', dbMock)
assert.equal(historical.workspaceItem.currentRevisionId, 'revision-1')
assert.equal(historical.revisions[0].workspaceItem.currentRevisionId, 'revision-0')
const page = await module.exports.readCreativeRevisions(actor, 'brand-1', '2026-11', 'idea-1', undefined, dbMock, 1)
assert.equal(page.workspaceItem.currentRevisionId, 'revision-1')

const legacySource = { id: 'old-idea', date: '2026-11-04', platform: 'Instagram', platformSlug: 'instagram', status: 'planned_unimplemented', title: 'Old idea', planning: 'Original', inspirationCreativeId: 'viral-1', aiTags: [], materialRequirements: [] }
let copiedWorkspace: any = { publishingCalendar: { months: { '2026-11': [legacySource] } } }
const savedRows: any[] = []
const copyDb: any = {
  $transaction: async (run: any) => run(copyDb), $queryRaw: async () => [],
  user: { findUnique: async () => ({ id: 'owner', status: 'ACTIVE', nickname: 'Owner', type: 'HUMAN', role: 'ADMIN', businessRoles: [] }) },
  brandKnowledge: {
    findUnique: async () => ({ marketingSolution: copiedWorkspace }),
    update: async ({ data }: any) => { copiedWorkspace = data.marketingSolution },
  },
  brandMarketingSolution: {
    findFirst: async ({ where }: any) => where.input ? null : savedRows.find(row => row.period === where.period) || null,
    findMany: async ({ where }: any) => savedRows.filter(row => row.period === where.period && (!where.id || row.id === where.id) && (!where.version || row.version < where.version.lt)).reverse(),
    create: async ({ data }: any) => { const row = { ...data, id: `saved-${savedRows.length}`, createdAt: new Date('2026-11-05T00:00:00Z') }; savedRows.push(row); return row },
  },
  brand: { findUnique: async () => ({ id: 'brand-1', name: 'Brand', crew: { id: 'crew-1', members: [] } }) },
  auditLog: { create: async () => ({}) },
  contentDraft: { create: () => { throw new Error('implicit draft create') }, upsert: () => { throw new Error('implicit draft upsert') }, update: () => { throw new Error('implicit draft update') }, delete: () => { throw new Error('implicit draft delete') } },
}
const copied = await module.exports.saveCreativeRevision(actor, 'brand-1', '2026-11', 'old-idea', {
  expectedRevision: revisionContract.creativeDigest(legacySource), idempotencyKey: 'copy-legacy-one', saveMode: 'copy', patch: { planning: 'New copy' },
}, copyDb)
const copy = copied.receipt.content
assert.equal(copy.schedule, null)
assert.equal(copy.legacy?.date, undefined)
assert.equal(copy.legacy?.platform, undefined)
assert.equal(copy.legacy?.status, undefined)
assert.equal(normalizeCreativeWorkspaceItem(copy).legacy, undefined)
assert.equal(calendarCreativeOption(copy)?.date, null)
assert.equal(copy.derivedFromCreativeId, 'old-idea')
assert.equal(copied.receipt.source.creativeId, 'viral-1')
assert.equal(copied.receipt.parentRevisionId, 'saved-0')
assert.equal(copiedWorkspace.publishingCalendar.months['2026-11'][0].date, '2026-11-04')
const editedUndated = await module.exports.saveCreativeRevision(actor, 'brand-1', '2026-11', copy.id, {
  expectedRevision: revisionContract.creativeDigest(copy), idempotencyKey: 'editor-undated-save', saveMode: 'overwrite', patch: undatedEditorPatch,
}, copyDb)
assert.equal(editedUndated.receipt.content.date, undefined)
assert.equal(editedUndated.receipt.content.schedule, null)
assert.equal(editedUndated.receipt.content.planning, 'Editor update')

const canonicalSource = { inspirationCreativeId: 'viral-canonical', creativeCandidateId: 'candidate-1', sourceRevision: 'source-v2', contentMatchRequestId: 'match-1', capturedAt: '2026-11-06T00:00:00Z', evidenceStatus: 'full_source', libraryDigest: 'digest-canonical', title: 'Source', platform: 'TikTok', originalPostUrl: null, originalVideoUrl: null, internalDetailPath: '/internal/viral-canonical', scriptContent: { scenes: ['one'] }, timeline: [{ id: 'shot-1' }] }
const canonicalCard = { id: 'canonical-idea', title: 'Canonical idea', planning: 'Original', status: 'idea_pending', source: canonicalSource, materialRequirements: [], aiTags: [] }
copiedWorkspace.publishingCalendar.months['2026-11'].push(canonicalCard)
const canonicalCopy = await module.exports.saveCreativeRevision(actor, 'brand-1', '2026-11', canonicalCard.id, {
  expectedRevision: revisionContract.creativeDigest(canonicalCard), idempotencyKey: 'copy-canonical-source', saveMode: 'copy', patch: { planning: 'Copied canonical source' },
}, copyDb)
assert.equal(canonicalCopy.receipt.source.creativeId, canonicalSource.inspirationCreativeId)
assert.equal(canonicalCopy.receipt.source.inspirationCreativeId, canonicalSource.inspirationCreativeId)
assert.equal(canonicalCopy.receipt.source.evidence, canonicalSource.evidenceStatus)
assert.deepEqual(canonicalCopy.receipt.source.snapshot, canonicalSource)
assert.deepEqual(canonicalCopy.receipt.workspaceItem.source, canonicalSource)
assert.deepEqual(canonicalCopy.receipt.content.source, canonicalSource)
const canonicalRead = await module.exports.readCreativeRevisions(actor, 'brand-1', '2026-11', canonicalCopy.receipt.content.id, undefined, copyDb)
assert.equal(canonicalRead.source.creativeId, canonicalSource.inspirationCreativeId)
assert.equal(canonicalRead.source.inspirationCreativeId, canonicalSource.inspirationCreativeId)
assert.equal(canonicalRead.source.evidence, canonicalSource.evidenceStatus)
assert.deepEqual(canonicalRead.source.snapshot, canonicalSource)
assert.deepEqual(canonicalRead.workspaceItem.source, canonicalSource)
assert.deepEqual(canonicalRead.revisions[0].source.snapshot, canonicalSource)
assert.deepEqual(canonicalRead.revisions[0].workspaceItem.source, canonicalSource)
console.log('PASS: undated editor save, canonical copy source, legacy reads, revision IDs, and no draft writes')
