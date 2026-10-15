import assert from 'node:assert/strict'
import { normalizeCreativeWorkspaceItem, validateCreativeWorkspacePatch } from '../src/lib/brand-plan/creativeWorkspaceContract.ts'

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
process.env.DATABASE_URL ||= 'postgresql://local@127.0.0.1:5432/amc_lineage_test_contract'
const { syncConfirmedCalendarItemsToDrafts } = await import('../src/lib/brand-plan/calendarSync.ts')
assert.deepEqual(await syncConfirmedCalendarItemsToDrafts('brand-1', '2026-11', [{ id: 'legacy', date: '2026-11-01', platform: 'Instagram', status: 'planned_unimplemented' }]), { syncedCount: 0 })
assert.deepEqual(await syncConfirmedCalendarItemsToDrafts('brand-1', '2026-11', [{ id: 'undated', title: 'A', status: 'idea_pending' }]), { syncedCount: 0 })
console.log('PASS: undated creative workspace normalization, editable patch boundary and read-only legacy inputs')
