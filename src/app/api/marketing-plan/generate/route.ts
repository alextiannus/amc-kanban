import { NextResponse } from 'next/server'
import { canSessionWriteBrandProject } from '@/lib/brandAccess'
import { BrandPlanError } from '@/lib/brand-plan/service'
import { generateAnnualMarketingPlan, generateQuarterMarketingPlan } from '@/lib/marketingPlanBuilder'
import { resolveSessionOrApiKey } from '@/lib/user-management/auth'

export const maxDuration = 60

export async function POST(request: Request) {
  const auth = await resolveSessionOrApiKey(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(request.url)
  const body = await request.json().catch(() => ({}))
  const brandId = typeof body?.brandId === 'string' ? body.brandId : url.searchParams.get('brandId') || ''
  if (!brandId) return NextResponse.json({ error: 'brand_id_required' }, { status: 400 })
  const canWrite = await canSessionWriteBrandProject(brandId, auth.user.id, auth.user.type)
  if (!canWrite) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const scope = body?.scope === 'quarter' ? 'quarter' : 'annual'
  try {
    const data = scope === 'quarter'
      ? await generateQuarterMarketingPlan({ brandId, body })
      : await generateAnnualMarketingPlan({ brandId, body })
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof BrandPlanError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[api/marketing-plan/generate] failed:', error)
    return NextResponse.json({ error: 'marketing_plan_generation_failed' }, { status: 500 })
  }
}
