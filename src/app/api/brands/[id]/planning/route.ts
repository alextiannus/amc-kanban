/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { authenticateRequest, canAccessBrand } from '@/lib/auth-v2'
import { prisma } from '@/lib/prisma'
import { ensureGrowthMerchantByBrandId } from '@/lib/growthDataCenter'
import { generateRemoteMaterialPlans, growthPlanningRequest } from '@/lib/growthPlanning'

type Context = { params: Promise<{ id: string }> }
const ALLOWED_ROLES = new Set(['ADMIN', 'AMC_PRINCIPAL'])

async function planningContext(request: Request, context: Context, write = false) {
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

export async function GET(request: Request, context: Context) {
  try {
    const auth = await planningContext(request, context)
    if ('response' in auth) return auth.response
    const [libraries, plans, reviews, requirements, assets] = await Promise.all([
      growthPlanningRequest<any>(`/v1/internal/merchants/${encodeURIComponent(auth.brandKey)}/inspiration-libraries`, { method: 'GET' }, auth.actor),
      growthPlanningRequest<any>(`/v1/internal/merchants/${encodeURIComponent(auth.brandKey)}/promotion-plans`, { method: 'GET' }, auth.actor),
      prisma.planningReview.findMany({ where: { brandId: auth.brand.id }, orderBy: { updatedAt: 'desc' } }),
      prisma.materialRequirement.findMany({ where: { brandId: auth.brand.id }, include: { submissions: { include: { asset: true } } }, orderBy: [{ remotePlanId: 'desc' }, { createdAt: 'asc' }] }),
      prisma.mediaAsset.findMany({ where: { brandId: auth.brand.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ])
    return NextResponse.json({ ok: true, brand: auth.brand, completeness: libraries.completeness || null, libraries: libraries.items || [], plans: plans.items || [], reviews, requirements, assets })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'planning_load_failed', details: error?.data }, { status: error?.status || 500 })
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const auth = await planningContext(request, context, true)
    if ('response' in auth) return auth.response
    const body = await request.json()
    const root = `/v1/internal/merchants/${encodeURIComponent(auth.brandKey)}`
    if (body.action === 'generate_inspiration') {
      return NextResponse.json(await growthPlanningRequest(`${root}/inspiration-libraries/generate`, { method: 'POST', body: JSON.stringify({ limit: body.limit || 12, targetPlatforms: body.targetPlatforms || [] }) }, auth.actor), { status: 201 })
    }
    if (body.action === 'review_inspiration') {
      const remote = await growthPlanningRequest(`${root}/inspiration-libraries/items/${encodeURIComponent(body.itemId)}`, { method: 'PATCH', body: JSON.stringify({ status: body.status, note: body.note }) }, auth.actor)
      await prisma.planningReview.upsert({ where: { brandId_resourceType_resourceId_resourceVersion: { brandId: auth.brand.id, resourceType: 'inspiration_item', resourceId: body.itemId, resourceVersion: Number(body.libraryVersion || 1) } },
        create: { brandId: auth.brand.id, resourceType: 'inspiration_item', resourceId: body.itemId, resourceVersion: Number(body.libraryVersion || 1), status: body.status === 'approved' ? 'APPROVED' : body.status === 'rejected' ? 'REJECTED' : 'PENDING', note: body.note, reviewedBy: auth.principal.userId, reviewedAt: new Date() },
        update: { status: body.status === 'approved' ? 'APPROVED' : body.status === 'rejected' ? 'REJECTED' : 'PENDING', note: body.note, reviewedBy: auth.principal.userId, reviewedAt: new Date() } })
      return NextResponse.json(remote)
    }
    if (body.action === 'revise_inspiration') {
      return NextResponse.json(await growthPlanningRequest(`${root}/inspiration-libraries/items/${encodeURIComponent(body.itemId)}`, { method: 'PATCH', body: JSON.stringify({ createNewVersion: true, title: body.title, coreAngle: body.coreAngle, brief: body.brief || {} }) }, auth.actor), { status: 201 })
    }
    if (body.action === 'set_library_state') {
      const remote = await growthPlanningRequest<any>(`${root}/inspiration-libraries/${encodeURIComponent(body.libraryId)}/state`, { method: 'POST', body: JSON.stringify({ state: body.state }) }, auth.actor)
      await prisma.planningReview.upsert({ where: { brandId_resourceType_resourceId_resourceVersion: { brandId: auth.brand.id, resourceType: 'inspiration_library', resourceId: body.libraryId, resourceVersion: Number(body.version) } },
        create: { brandId: auth.brand.id, resourceType: 'inspiration_library', resourceId: body.libraryId, resourceVersion: Number(body.version), status: body.state === 'approved' ? 'APPROVED' : 'PENDING', note: body.note, reviewedBy: auth.principal.userId, reviewedAt: body.state === 'approved' ? new Date() : null },
        update: { status: body.state === 'approved' ? 'APPROVED' : 'PENDING', note: body.note, reviewedBy: auth.principal.userId, reviewedAt: body.state === 'approved' ? new Date() : null } })
      return NextResponse.json(remote)
    }
    if (body.action === 'generate_plan') {
      return NextResponse.json(await growthPlanningRequest(`${root}/promotion-plans/generate`, { method: 'POST', body: JSON.stringify({ periodDays: body.periodDays, startDate: body.startDate, targetPlatforms: body.targetPlatforms || [], frequencyPerWeek: body.frequencyPerWeek || 2, constraints: body.constraints || '' }) }, auth.actor), { status: 201 })
    }
    if (body.action === 'set_plan_state') {
      const remote = await growthPlanningRequest<any>(`${root}/promotion-plans/${encodeURIComponent(body.planId)}`, { method: 'PATCH', body: JSON.stringify({ state: body.state }) }, auth.actor)
      await prisma.planningReview.upsert({ where: { brandId_resourceType_resourceId_resourceVersion: { brandId: auth.brand.id, resourceType: 'promotion_plan', resourceId: body.planId, resourceVersion: Number(body.version) } },
        create: { brandId: auth.brand.id, resourceType: 'promotion_plan', resourceId: body.planId, resourceVersion: Number(body.version), status: body.state === 'approved' ? 'APPROVED' : 'PENDING', note: body.note, reviewedBy: auth.principal.userId, reviewedAt: body.state === 'approved' ? new Date() : null },
        update: { status: body.state === 'approved' ? 'APPROVED' : 'PENDING', note: body.note, reviewedBy: auth.principal.userId, reviewedAt: body.state === 'approved' ? new Date() : null } })
      return NextResponse.json(remote)
    }
    if (body.action === 'update_plan_item') {
      return NextResponse.json(await growthPlanningRequest(`${root}/promotion-plans/${encodeURIComponent(body.planId)}`, { method: 'PATCH', body: JSON.stringify({ item: body.item }) }, auth.actor))
    }
    if (body.action === 'delete_plan_item') {
      return NextResponse.json(await growthPlanningRequest(`${root}/promotion-plans/${encodeURIComponent(body.planId)}`, { method: 'PATCH', body: JSON.stringify({ deleteItemId: body.planItemId }) }, auth.actor))
    }
    if (body.action === 'generate_materials') {
      const [plans, libraries] = await Promise.all([
        growthPlanningRequest<any>(`${root}/promotion-plans`, { method: 'GET' }, auth.actor),
        growthPlanningRequest<any>(`${root}/inspiration-libraries`, { method: 'GET' }, auth.actor),
      ])
      const plan = (plans.items || []).find((item: any) => item.id === body.planId)
      if (!plan || plan.state !== 'approved') return NextResponse.json({ error: 'approved_plan_required' }, { status: 409 })
      const existingAssets = await prisma.mediaAsset.findMany({ where: { brandId: auth.brand.id }, select: { id: true, mimeType: true, aiTags: true, aiCaption: true } })
      const generated = await generateRemoteMaterialPlans({ brandKey: auth.brandKey, brandName: auth.brand.name, facts: libraries.facts || [], planItems: plan.items.map((item: any) => ({ id: item.id, title: item.title, platform: item.platform, format: item.contentFormat, contentBrief: item.contentBrief })), existingAssets: existingAssets.map((asset: { id: string; mimeType: string; aiTags: string[]; aiCaption: string | null }) => ({ id: asset.id, mimeType: asset.mimeType, tags: asset.aiTags, caption: asset.aiCaption })) })
      for (const materialPlan of generated.items) {
        const planItem = plan.items.find((item: any) => item.id === materialPlan.planItemId)
        for (const [index, requirement] of materialPlan.requirements.entries()) {
          await prisma.materialRequirement.upsert({ where: { brandId_remotePlanItemId_requirementKey: { brandId: auth.brand.id, remotePlanItemId: materialPlan.planItemId, requirementKey: `${requirement.type || 'asset'}:${index}` } },
            create: { brandId: auth.brand.id, remotePlanId: plan.id, remotePlanVersion: plan.version, remotePlanItemId: materialPlan.planItemId, requirementKey: `${requirement.type || 'asset'}:${index}`, specification: requirement as any, required: requirement.required !== false, dueAt: planItem?.materialDueDate ? new Date(planItem.materialDueDate) : null },
            update: { specification: requirement as any, required: requirement.required !== false, dueAt: planItem?.materialDueDate ? new Date(planItem.materialDueDate) : null } })
        }
      }
      return NextResponse.json({ ok: true, generation: generated.generation })
    }
    if (body.action === 'submit_material') {
      const requirement = await prisma.materialRequirement.findFirst({ where: { id: body.requirementId, brandId: auth.brand.id } })
      const asset = await prisma.mediaAsset.findFirst({ where: { id: body.assetId, brandId: auth.brand.id } })
      if (!requirement || !asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const submission = await prisma.materialSubmission.upsert({ where: { requirementId_assetId: { requirementId: requirement.id, assetId: asset.id } }, create: { requirementId: requirement.id, assetId: asset.id, submittedBy: auth.principal.userId }, update: { status: 'SUBMITTED', note: null, submittedBy: auth.principal.userId, reviewedBy: null, reviewedAt: null } })
      await prisma.materialRequirement.update({ where: { id: requirement.id }, data: { status: 'SUBMITTED' } })
      return NextResponse.json({ ok: true, submission })
    }
    if (body.action === 'review_material') {
      const status = body.status === 'ACCEPTED' ? 'ACCEPTED' : body.status === 'REJECTED' ? 'REJECTED' : null
      if (!status) return NextResponse.json({ error: 'invalid_material_status' }, { status: 400 })
      const submission = await prisma.materialSubmission.findFirst({ where: { id: body.submissionId, requirement: { brandId: auth.brand.id } }, include: { requirement: true } })
      if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      await prisma.materialSubmission.update({ where: { id: submission.id }, data: { status, note: body.note, reviewedBy: auth.principal.userId, reviewedAt: new Date() } })
      const accepted = await prisma.materialSubmission.count({ where: { requirementId: submission.requirementId, status: 'ACCEPTED' } })
      await prisma.materialRequirement.update({ where: { id: submission.requirementId }, data: { status: accepted ? 'ACCEPTED' : status } })
      const remaining = await prisma.materialRequirement.count({ where: { brandId: auth.brand.id, remotePlanId: submission.requirement.remotePlanId, required: true, status: { not: 'ACCEPTED' } } })
      if (remaining === 0) await growthPlanningRequest(`${root}/promotion-plans/${encodeURIComponent(submission.requirement.remotePlanId)}`, { method: 'PATCH', body: JSON.stringify({ state: 'material_ready' }) }, auth.actor)
      return NextResponse.json({ ok: true, materialReady: remaining === 0 })
    }
    return NextResponse.json({ error: 'unknown_planning_action' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'planning_action_failed', details: error?.data }, { status: error?.status || 500 })
  }
}
