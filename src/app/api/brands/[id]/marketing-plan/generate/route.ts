import { NextResponse } from 'next/server'
import { canSessionWriteBrandProject } from '@/lib/brandAccess'
import { BrandPlanError } from '@/lib/brand-plan/service'
import { generateAnnualMarketingPlan, generateQuarterMarketingPlan } from '@/lib/marketingPlanBuilder'
import { resolveSessionOrApiKey } from '@/lib/user-management/auth'

type Params = { params: Promise<{ id: string }> }

export const maxDuration = 60

export async function POST(request: Request, { params }: Params) {
  const auth = await resolveSessionOrApiKey(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const canWrite = await canSessionWriteBrandProject(id, auth.user.id, auth.user.type)
  if (!canWrite) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const scope = body?.scope === 'quarter' ? 'quarter' : 'annual'
  try {
    const data = scope === 'quarter'
      ? await generateQuarterMarketingPlan({ brandId: id, body })
      : await generateAnnualMarketingPlan({ brandId: id, body })
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof BrandPlanError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[marketing-plan/generate] failed:', error)
    return NextResponse.json({ error: 'marketing_plan_generation_failed' }, { status: 500 })
  }
}
