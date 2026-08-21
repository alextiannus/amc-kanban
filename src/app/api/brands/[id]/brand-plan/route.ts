import { NextResponse } from 'next/server'
import { resolveSessionOrApiKey } from '@/lib/user-management/auth'
import { canSessionAccessBrandProject, canSessionWriteBrandProject } from '@/lib/brandAccess'
import {
  BrandPlanError,
  getBrandPlan,
  runBrandPlanAction,
} from '@/lib/brand-plan/service'

type Params = { params: Promise<{ id: string }> }

export const maxDuration = 60

export async function GET(request: Request, { params }: Params) {
  const auth = await resolveSessionOrApiKey(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const canRead = await canSessionAccessBrandProject(id, auth.user.id, auth.user.type, auth.user.role)
  if (!canRead) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const data = await getBrandPlan(id)
  return data ? NextResponse.json({ ok: true, ...data }) : NextResponse.json({ error: 'Brand not found' }, { status: 404 })
}

export async function POST(request: Request, { params }: Params) {
  const auth = await resolveSessionOrApiKey(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const canWrite = await canSessionWriteBrandProject(id, auth.user.id, auth.user.type)
  if (!canWrite) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const action = typeof body?.action === 'string' ? body.action : ''
  try {
    const data = await runBrandPlanAction({
      brandId: id,
      action: action as Parameters<typeof runBrandPlanAction>[0]['action'],
      body,
    })
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof BrandPlanError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[brand-plan] action failed:', error)
    return NextResponse.json({ error: 'brand_plan_action_failed' }, { status: 500 })
  }
}
