import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { Prisma } from '@prisma/client'
import { CreativeRevisionError } from '../src/lib/brand-plan/creativeRevisionContract.ts'
import { planningRevision } from '../src/lib/ai-native/planning-workspace-contract.ts'

// Exercise the real action and serializer without connecting to an application DB.
const report = { generatedAt: '2026-10-14T01:00:00.000Z', sourceSystem: 'amc-growth',
  summary: 'Research', missingQuestions: ['What brings customers here?'] }
const workspace = { researchReport: report, annualPlan: { goal: 'Keep existing plan' },
  publishingCalendar: { months: { '2026-11': [{ id: 'manual-script', title: 'Manual revision' }] } } }
let knowledge: any, interviews: any[], failClaim = false, beforeSave: (() => void) | null = null
let workspaceWrites = 0
const reset = (hasKnowledge = true) => {
  knowledge = hasKnowledge ? { updatedAt: new Date('2026-10-14T01:00:00Z'), marketingSolution: structuredClone(workspace), publishingFreq: { instagram: 3 } } : null
  interviews = []; failClaim = false; beforeSave = null; workspaceWrites = 0
}
const tx = {
  brandPlanInterview: { create: async ({ data }: any) => {
    const saved = { ...data, id: `interview-${interviews.length + 1}`, answers: data.answers ?? null, completedAt: new Date() }
    interviews.push(saved); return saved
  } },
  brandKnowledge: {
    upsert: async ({ update, create }: any) => {
      if (failClaim) throw new Error('claim_write_failed')
      assert.deepEqual(Object.keys(update), ['brandClaim'])
      knowledge = { ...(knowledge || create), ...update, updatedAt: new Date() }
      return knowledge
    },
    updateMany: async ({ where, data }: any) => {
      workspaceWrites++
      if (knowledge.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 }
      knowledge = { ...knowledge, ...data }; return { count: 1 }
    },
    create: async () => { workspaceWrites++; throw Object.assign(new Error('duplicate'), { code: 'P2002' }) },
  },
}
const db = {
  ...tx,
  brand: { findUnique: async () => {
    const loaded = { id: 'brand', name: 'Test merchant', knowledge: structuredClone(knowledge), brandPlanInterviews: [...interviews].reverse() }
    beforeSave?.(); return loaded
  } },
  $transaction: async (fn: any) => {
    const original = structuredClone({ knowledge, interviews })
    try { return await fn(tx) } catch (error) {
      knowledge = original.knowledge; interviews = original.interviews; throw error
    }
  },
}
const mod = { exports: {} as any }
new Function('require', 'module', 'exports', ts.transpileModule(
  readFileSync('src/lib/brand-plan/service.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText)((key: string) => {
  if (key === '@/lib/prisma') return { prisma: db }
  if (key === '@prisma/client') return { Prisma }
  if (key === './creativeRevisionContract') return { CreativeRevisionError }
  if (key === './creativeRevisions') return { protectTrackedCreativeChanges: async () => {} }
  if (key === '../ai-native/planning-workspace-contract') return { planningRevision }
  if (key === 'crypto') return { createHash: () => { throw new Error('unexpected hashing') } }
  return {}
}, mod, mod.exports)
const save = (body: any = { rawNotes: 'Customers come for our handmade noodles.' }) =>
  mod.exports.runBrandPlanAction({ brandId: 'brand', action: 'save_merchant_interview', body })

reset()
const originalWorkspace = structuredClone(knowledge.marketingSolution)
const saved = await save()
assert.equal(saved.ok, true)
assert.equal(saved.merchantInterview.rawNotes, 'Customers come for our handmade noodles.')
assert.equal(saved.merchantInterviewRequired, false)
assert.equal(interviews.length, 1)
assert.equal(knowledge.brandClaim.interviewId, saved.merchantInterview.id)
assert.deepEqual(knowledge.marketingSolution, originalWorkspace)
assert.deepEqual(knowledge.publishingFreq, { instagram: 3 })
assert.equal(workspaceWrites, 0)
assert.equal((await mod.exports.getBrandPlan('brand')).merchantInterview.id, saved.merchantInterview.id)
const updated = await save({ rawNotes: 'The owner now wants to promote lunch reservations.' })
assert.equal(interviews.length, 2)
assert.equal(interviews[0].rawNotes, saved.merchantInterview.rawNotes)
assert.equal(knowledge.brandClaim.interviewId, updated.merchantInterview.id)
assert.equal((await mod.exports.getBrandPlan('brand')).merchantInterview.id, updated.merchantInterview.id)

reset()
beforeSave = () => { knowledge.marketingSolution.annualPlan.goal = 'Concurrent manual edit' }
await save({ answers: [{ question: 'What do customers order?', answer: 'Noodles' }, { question: '', answer: 'Ignored' }] })
assert.equal(knowledge.marketingSolution.annualPlan.goal, 'Concurrent manual edit')
assert.equal(interviews[0].rawNotes, 'What do customers order?\nNoodles')
assert.equal(workspaceWrites, 0)

reset()
await save()
const beforeFailure = structuredClone({ knowledge, interviews })
failClaim = true
await assert.rejects(() => save({ rawNotes: 'Must roll back' }), /claim_write_failed/)
assert.deepEqual({ knowledge, interviews }, beforeFailure, 'A failed brand claim must roll back the interview and keep prior data')

reset()
await assert.rejects(() => save({ rawNotes: ' ' }), (error: any) => error.code === 'merchant_interview_required')
assert.equal(interviews.length, 0)
reset(false)
await assert.rejects(save, (error: any) => error.code === 'growth_research_report_required')
assert.equal(interviews.length, 0)

console.log('Merchant interview save, readback, plan preservation and rollback tests passed.')
