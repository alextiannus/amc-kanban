import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import {
  generatePromotionStrategyPlan,
  serializePromotionStrategyKnowledge,
} from './service'

type Params = { params: Promise<{ id: string }> }

export async function promotionStrategyStatus(_request: Request, context: Params) {
  const access = await requirePromotionStrategyAccess(context, false)
  if ('response' in access) return access.response
  return NextResponse.json({
    ok: true,
    brand: access.brand,
    module: 'promotion-strategy',
    message: 'Kanban owns promotion strategy generation. POST with goal and sellingPoints to generate a reviewable draft.',
  })
}

export async function generatePromotionStrategy(request: Request, context: Params) {
  try {
    const access = await requirePromotionStrategyAccess(context, true)
    if ('response' in access) return access.response
    const body = await request.json().catch(() => ({}))
    const plan = await generatePromotionStrategyPlan({
      brand: access.brand,
      knowledge: access.knowledge,
      actor: access.actor,
      body,
    })
    return NextResponse.json({ ok: true, module: 'promotion-strategy', plan })
  } catch (error) {
    console.error('[PromotionStrategy] failed:', error)
    const message = error instanceof Error ? error.message : 'promotion_strategy_generation_failed'
    const status = typeof error === 'object' && error && 'status' in error && typeof error.status === 'number' ? error.status : 500
    return NextResponse.json({ error: message }, { status })
  }
}

async function requirePromotionStrategyAccess(context: Params, write: boolean) {
  const session = await getSession()
  if (!session?.user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { id: brandId } = await context.params
  const ok = await canSessionAccessBrandProject(
    brandId,
    session.user.id,
    session.user.type ?? 'HUMAN',
    session.user.role,
  )
  if (!ok) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: { knowledge: true },
  })
  if (!brand) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  const roles = session.user.userRoles?.length ? session.user.userRoles : [session.user.role].filter(Boolean)
  const canWrite = roles.some((role: string) => ['ADMIN', 'AMC_PRINCIPAL'].includes(role))
  if (write && !canWrite) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return {
    brand,
    knowledge: serializePromotionStrategyKnowledge(brand.knowledge),
    actor: { userId: session.user.id, email: session.user.email, roles },
  }
}
