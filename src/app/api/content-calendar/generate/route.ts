import { NextResponse } from 'next/server'
import { canSessionWriteBrandProject } from '@/lib/brandAccess'
import { BrandPlanError } from '@/lib/brand-plan/service'
import {
  generateContentPublicationCalendar,
  regenerateContentPublicationCalendarItem,
} from '@/lib/calendarService'
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

  const shouldRegenerateOne = Boolean(body?.itemId || body?.refreshItemId || body?.mode === 'single')
  const actionBody = body?.refreshItemId && !body?.itemId
    ? { ...body, itemId: body.refreshItemId }
    : body

  try {
    const data = shouldRegenerateOne
      ? await regenerateContentPublicationCalendarItem({ brandId, body: actionBody })
      : await generateContentPublicationCalendar({ brandId, body: actionBody })
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof BrandPlanError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[api/content-calendar/generate] failed:', error)
    return NextResponse.json({ error: 'content_calendar_generation_failed' }, { status: 500 })
  }
}
