import { NextResponse } from 'next/server'
import { canSessionWriteBrandProject } from '@/lib/brandAccess'
import { BrandPlanError } from '@/lib/brand-plan/service'
import {
  generateContentPublicationCalendar,
  regenerateContentPublicationCalendarItem,
} from '@/lib/calendarService'
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
  const shouldRegenerateOne = Boolean(body?.itemId || body?.refreshItemId || body?.mode === 'single')
  const actionBody = body?.refreshItemId && !body?.itemId
    ? { ...body, itemId: body.refreshItemId }
    : body

  try {
    const data = shouldRegenerateOne
      ? await regenerateContentPublicationCalendarItem({ brandId: id, body: actionBody })
      : await generateContentPublicationCalendar({ brandId: id, body: actionBody })
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof BrandPlanError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[content-calendar/generate] failed:', error)
    return NextResponse.json({ error: 'content_calendar_generation_failed' }, { status: 500 })
  }
}
