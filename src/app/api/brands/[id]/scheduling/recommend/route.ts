import { NextResponse } from 'next/server'
import { authenticateRequest, requireCapability } from '@/lib/auth-v2'
import { getSchedulingRecommendations } from '@/lib/schedulingRecommendation'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = await authenticateRequest(request)
  if (!principal) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId } = await params
  try {
    await requireCapability(principal, 'content.schedule', { brandId })
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const platform = typeof body.platform === 'string' ? body.platform : null
  const urgency = body.urgency === 'urgent' ? 'urgent' : 'normal'
  return NextResponse.json(
    await getSchedulingRecommendations({ brandId, platform, urgency }),
  )
}
