/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { authenticateRequest, canAccessBrand } from '@/lib/auth-v2'
import { prisma } from '@/lib/prisma'
import { ensureGrowthMerchantByBrandId } from '@/lib/growthDataCenter'
import { generateRemoteMaterialPlans, growthPlanningRequest } from '@/lib/growthPlanning'

type Context = { params: Promise<{ id: string }> }
type ExecutionAuth = {
  principal: NonNullable<Awaited<ReturnType<typeof authenticateRequest>>>
  brand: { id: string; name: string; growthBrandKey: string | null }
  brandKey: string
  actor: { userId: string; email?: string | null; roles: string[] }
}
const ALLOWED_ROLES = new Set(['ADMIN', 'AMC_PRINCIPAL'])

async function executionContext(request: Request, context: Context, write = false) {
  const principal = await authenticateRequest(request)
  if (!principal || principal.source !== 'session' || principal.actorType !== 'HUMAN') return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!principal.globalRoles.some((role) => ALLOWED_ROLES.has(role))) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  const { id: brandId } = await context.params
  if (!(await canAccessBrand(principal, brandId, write ? 'brand.update' : 'brand.read'))) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true, growthBrandKey: true } })
  if (!brand) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  const brandKey = brand.growthBrandKey || await ensureGrowthMerchantByBrandId(brandId)
  return { principal, brand, brandKey, actor: { userId: principal.userId, email: principal.email, roles: principal.globalRoles } }
}

async function activePlan(auth: ExecutionAuth) {
  const root = `/v1/internal/merchants/${encodeURIComponent(auth.brandKey)}`
  const result = await growthPlanningRequest<any>(`${root}/promotion-plans/active?includeFacts=true`, { method: 'GET' }, auth.actor)
  return { root, plan: result.plan || null, facts: Array.isArray(result.facts) ? result.facts : [] }
}

export async function GET(request: Request, context: Context) {
  try {
    const auth = await executionContext(request, context)
    if ('response' in auth) return auth.response
    const [{ plan }, requirements, assets] = await Promise.all([
      activePlan(auth),
      prisma.materialRequirement.findMany({ where: { brandId: auth.brand.id }, include: { submissions: { include: { asset: true } } }, orderBy: { createdAt: 'asc' } }),
      prisma.mediaAsset.findMany({ where: { brandId: auth.brand.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ])
    return NextResponse.json({ ok: true, brand: auth.brand, plan, requirements: plan ? requirements.filter((item: { remotePlanId: string }) => item.remotePlanId === plan.id) : [], assets })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'promotion_execution_load_failed', details: error?.data }, { status: error?.status || 500 })
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const auth = await executionContext(request, context, true)
    if ('response' in auth) return auth.response
    const body = await request.json()
    const { root, plan, facts } = await activePlan(auth)
    if (!plan || !plan.isActive || !['approved', 'material_ready'].includes(plan.state)) return NextResponse.json({ error: 'active_approved_plan_required' }, { status: 409 })

    if (body.action === 'generate_materials') {
      if (plan.state !== 'approved') return NextResponse.json({ error: 'approved_plan_required' }, { status: 409 })
      const existingAssets = await prisma.mediaAsset.findMany({ where: { brandId: auth.brand.id }, select: { id: true, mimeType: true, aiTags: true, aiCaption: true } })
      const generated = await generateRemoteMaterialPlans({ brandKey: auth.brandKey, brandName: auth.brand.name, facts, planItems: plan.items.map((item: any) => ({ id: item.id, title: item.title, platform: item.platform, format: item.contentFormat, contentBrief: item.contentBrief })), existingAssets: existingAssets.map((asset: { id: string; mimeType: string; aiTags: string[]; aiCaption: string | null }) => ({ id: asset.id, mimeType: asset.mimeType, tags: asset.aiTags, caption: asset.aiCaption })) })
      for (const materialPlan of generated.items) {
        const planItem = plan.items.find((item: any) => item.id === materialPlan.planItemId)
        for (const [index, requirement] of materialPlan.requirements.entries()) {
          await prisma.materialRequirement.upsert({
            where: { brandId_remotePlanItemId_requirementKey: { brandId: auth.brand.id, remotePlanItemId: materialPlan.planItemId, requirementKey: `${requirement.type || 'asset'}:${index}` } },
            create: { brandId: auth.brand.id, remotePlanId: plan.id, remotePlanVersion: plan.version, remotePlanItemId: materialPlan.planItemId, requirementKey: `${requirement.type || 'asset'}:${index}`, specification: requirement as any, required: requirement.required !== false, dueAt: planItem?.materialDueDate ? new Date(planItem.materialDueDate) : null },
            update: { remotePlanId: plan.id, remotePlanVersion: plan.version, specification: requirement as any, required: requirement.required !== false, dueAt: planItem?.materialDueDate ? new Date(planItem.materialDueDate) : null },
          })
        }
      }
      return NextResponse.json({ ok: true, generation: generated.generation })
    }

    if (body.action === 'submit_material') {
      const requirement = await prisma.materialRequirement.findFirst({ where: { id: body.requirementId, brandId: auth.brand.id, remotePlanId: plan.id } })
      const asset = await prisma.mediaAsset.findFirst({ where: { id: body.assetId, brandId: auth.brand.id } })
      if (!requirement || !asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const submission = await prisma.materialSubmission.upsert({ where: { requirementId_assetId: { requirementId: requirement.id, assetId: asset.id } }, create: { requirementId: requirement.id, assetId: asset.id, submittedBy: auth.principal.userId }, update: { status: 'SUBMITTED', note: null, submittedBy: auth.principal.userId, reviewedBy: null, reviewedAt: null } })
      await prisma.materialRequirement.update({ where: { id: requirement.id }, data: { status: 'SUBMITTED' } })
      return NextResponse.json({ ok: true, submission })
    }

    if (body.action === 'review_material') {
      const status = body.status === 'ACCEPTED' ? 'ACCEPTED' : body.status === 'REJECTED' ? 'REJECTED' : null
      if (!status) return NextResponse.json({ error: 'invalid_material_status' }, { status: 400 })
      const submission = await prisma.materialSubmission.findFirst({ where: { id: body.submissionId, requirement: { brandId: auth.brand.id, remotePlanId: plan.id } }, include: { requirement: true } })
      if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      await prisma.materialSubmission.update({ where: { id: submission.id }, data: { status, note: body.note, reviewedBy: auth.principal.userId, reviewedAt: new Date() } })
      const accepted = await prisma.materialSubmission.count({ where: { requirementId: submission.requirementId, status: 'ACCEPTED' } })
      await prisma.materialRequirement.update({ where: { id: submission.requirementId }, data: { status: accepted ? 'ACCEPTED' : status } })
      const remaining = await prisma.materialRequirement.count({ where: { brandId: auth.brand.id, remotePlanId: plan.id, required: true, status: { not: 'ACCEPTED' } } })
      if (remaining === 0 && plan.state !== 'material_ready') await growthPlanningRequest(`${root}/promotion-plans/${encodeURIComponent(plan.id)}`, { method: 'PATCH', body: JSON.stringify({ state: 'material_ready' }) }, auth.actor)
      return NextResponse.json({ ok: true, materialReady: remaining === 0 })
    }
    return NextResponse.json({ error: 'unknown_promotion_execution_action' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'promotion_execution_action_failed', details: error?.data }, { status: error?.status || 500 })
  }
}
