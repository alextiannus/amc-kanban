import { CalendarNoteError, parseCalendarNoteInput, saveCalendarNote, validCalendarMonth, type CalendarNoteDatabase } from './calendarNotes.ts'

type Actor = { id: string; type: string; role?: string }
export function calendarNotesHandlers(deps: {
  db: CalendarNoteDatabase
  authenticate: (request: Request) => Promise<{ user: Actor } | null>
  canRead: (brandId: string, actor: Actor) => Promise<boolean>
  canWrite: (brandId: string, actor: Actor) => Promise<boolean>
}) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  async function handle(request: Request, brandId: string, date?: string) {
    try {
      const auth = await deps.authenticate(request)
      if (!auth) return json({ error: 'Unauthorized' }, 401)
      const allowed = await (date === undefined ? deps.canRead : deps.canWrite)(brandId, auth.user)
      if (!allowed) return json({ error: 'Not found' }, 404)
      if (date !== undefined) {
        const input = parseCalendarNoteInput(date, await request.json().catch(() => null))
        const note = await saveCalendarNote(deps.db, { ...input, brandId, actorId: auth.user.id })
        return json({ ok: true, note })
      }
      const month = new URL(request.url).searchParams.get('month')
      if (!validCalendarMonth(month)) return json({ error: 'invalid_calendar_month' }, 400)
      const [notes, canEdit] = await Promise.all([
        deps.db.calendarNote.findMany({ where: { brandId, date: { startsWith: `${month}-` } }, orderBy: { date: 'asc' } }),
        deps.canWrite(brandId, auth.user),
      ])
      return json({ ok: true, notes, canEdit })
    } catch (error) {
      if (error instanceof CalendarNoteError) return json({ error: error.code }, error.status)
      console.error('[calendar-notes] request failed:', error)
      return json({ error: 'calendar_notes_failed' }, 500)
    }
  }
  return {
    GET: (request: Request, brandId: string) => handle(request, brandId),
    PUT: (request: Request, brandId: string, date: string) => handle(request, brandId, date),
  }
}
