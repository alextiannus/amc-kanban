import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { generateGrowthResearchReportForBrand, readGrowthResearchJob, regenerateGrowthV5FromSnapshot, GrowthDataCenterError } from '../growthDataCenter'
import { researchReportIdentity, researchRequestStatus, v5ResearchReport, type ResearchRequest } from '../growthResearchV5'
import { buildGrowthMerchantContext, saveResearchReport, type loadBrandPlanBrand } from './service'

type Brand = NonNullable<Awaited<ReturnType<typeof loadBrandPlanBrand>>>
const terminal = new Set(['completed', 'failed', 'cancelled', 'superseded'])
const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {}
async function lock(tx: Prisma.TransactionClient, brandId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`growth-report:${brandId}`}, 0))`
}

export async function startResearchRequest(brand: Brand) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await lock(tx, brand.id)
    const knowledge = await tx.brandKnowledge.findUnique({ where: { brandId: brand.id } })
    const workspace = record(knowledge?.marketingSolution)
    const pending = workspace.researchRequest as ResearchRequest | undefined
    if (pending?.id && !terminal.has(pending.status)) return pending
    const id = randomUUID()
    const request: ResearchRequest = { id, requestKey: `amc-kanban-brand-plan:${brand.id}:v5:${id}`,
      status: 'starting', startedAt: new Date().toISOString(),
      reuseJobId: pending?.jobId || (workspace.researchReport || record(knowledge?.researchReport)).growthJobId,
      baseReport: researchReportIdentity(workspace.researchReport || knowledge?.researchReport) }
    const value = { ...workspace, researchRequest: request } as Prisma.InputJsonValue
    await tx.brandKnowledge.upsert({ where: { brandId: brand.id },
      create: { brandId: brand.id, negPrompts: [], marketingSolution: value }, update: { marketingSolution: value } })
    return request
  })
}

/** Complete only the persisted request. Never create a replacement for an uncertain submission. */
export async function synchronizeResearchRequest(brand: Brand) {
  const request = record(brand.knowledge?.marketingSolution).researchRequest as ResearchRequest | undefined
  if (!request?.id || terminal.has(request.status)) return false
  try {
    const context = request.jobId ? null : await buildGrowthMerchantContext(brand)
    let job
    if (request.jobId) job = await readGrowthResearchJob(request.jobId)
    else {
      if (request.reuseJobId) {
        try { job = await regenerateGrowthV5FromSnapshot(brand.id, request.reuseJobId, context!, request.requestKey) }
        catch (error) {
          // Only a definite incompatible/missing snapshot permits a fresh collection.
          if (!(error instanceof GrowthDataCenterError) || !['research_scope_denied', 'research_identity_changed', 'evidence_not_ready'].includes(error.code)) throw error
        }
      }
      job ||= await generateGrowthResearchReportForBrand(brand, context!, { requestKey: request.requestKey, maxWaitMs: 0 })
    }
    const status = researchRequestStatus(job)
    const report = status === 'completed' ? v5ResearchReport(brand, job) : null
    if (status === 'completed' && !report) throw new Error('growth_research_template_mismatch')
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, brand.id)
      const current = await tx.brandKnowledge.findUnique({ where: { brandId: brand.id } })
      const workspace = record(current?.marketingSolution)
      const active = workspace.researchRequest as ResearchRequest | undefined
      if (active?.id !== request.id || terminal.has(active.status)) return false
      const next: ResearchRequest = { ...active, jobId: job.job_id || active.jobId, status,
        blockers: job.automatic_report?.blockers || [], error: status === 'failed' ? '调研未完成，请重试。' : undefined }
      if (!report && JSON.stringify(next) === JSON.stringify(active)) return false
      const data: Record<string, any> = { ...workspace, researchRequest: next }
      if (report) {
        if (researchReportIdentity(workspace.researchReport || current?.researchReport) !== request.baseReport) {
          next.status = 'superseded'
        } else {
          data.researchReport = await saveResearchReport(brand.id, report, tx)
        }
      }
      await tx.brandKnowledge.update({ where: { brandId: brand.id }, data: { marketingSolution: data as Prisma.InputJsonValue } })
      return true
    })
  } catch (error) {
    // A network failure is not proof the upstream submission failed. Retain its key and prior report.
    const invalidReport = error instanceof Error && ['growth_research_report_missing', 'growth_research_template_mismatch'].includes(error.message)
    try {
      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await lock(tx, brand.id)
        const current = await tx.brandKnowledge.findUnique({ where: { brandId: brand.id } })
        const workspace = record(current?.marketingSolution), active = workspace.researchRequest as ResearchRequest | undefined
        if (active?.id !== request.id || terminal.has(active.status)) return false
        const message = invalidReport ? '报告正文未能保存，请重试。' : '暂时无法同步调研进度，稍后会继续。'
        if (active.error === message) return false
        await tx.brandKnowledge.update({ where: { brandId: brand.id }, data: { marketingSolution: { ...workspace,
          researchRequest: { ...active, ...(invalidReport ? { status: 'failed' } : {}), error: message } } as Prisma.InputJsonValue } })
        return true
      })
    } catch { return false }
  }
}
