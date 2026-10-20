import { NextResponse } from 'next/server'
import { resolveSessionOrApiKey } from '@/lib/user-management/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { listOpenCalendarCreativeOptions } from '@/lib/brand-plan/calendarSync'

export const dynamic='force-dynamic'

type Params = { params: Promise<{ id: string }> }

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

export async function GET(request: Request, { params }: Params) {
  const auth = await resolveSessionOrApiKey(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const canRead = await canSessionAccessBrandProject(id, auth.user.id, auth.user.type, auth.user.role)
  if (!canRead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') || '')
    ? url.searchParams.get('month')!
    : currentMonth()
  const creatives = await listOpenCalendarCreativeOptions(id, month, undefined, {includeHistory:url.searchParams.get('includeHistory')==='true'})
  return NextResponse.json({ ok: true, month, creatives },{headers:{'Cache-Control':'no-store'}})
}
