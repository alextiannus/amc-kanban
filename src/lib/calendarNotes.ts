export const CALENDAR_NOTE_LIMIT = 2000
export const CALENDAR_NOTE_TITLE_LIMIT = 40
export const CALENDAR_NOTE_COLORS = ['yellow', 'green', 'blue', 'purple', 'orange', 'pink'] as const
export type CalendarNoteColor = typeof CALENDAR_NOTE_COLORS[number]
function isCalendarNoteColor(value: unknown): value is CalendarNoteColor {
  return typeof value === 'string' && (CALENDAR_NOTE_COLORS as readonly string[]).includes(value)
}

export class CalendarNoteError extends Error {
  constructor(public code: string, public status: number) { super(code) }
}

export type CalendarNote = {
  id: string
  brandId: string
  date: string
  title: string
  body: string
  color: CalendarNoteColor
  version: number
  createdBy: string
  updatedBy: string
  createdAt: Date
  updatedAt: Date
}

type NoteKey = { brandId_date: { brandId: string; date: string } }
type NoteRepository = {
  findMany(args: { where: { brandId: string; date: { startsWith: string } }; orderBy: { date: 'asc' } }): Promise<CalendarNote[]>
  create(args: { data: { brandId: string; date: string; title: string; body: string; color: CalendarNoteColor; createdBy: string; updatedBy: string } }): Promise<CalendarNote>
  updateMany(args: { where: { brandId: string; date: string; version: number }; data: { title?: string; body: string; color?: CalendarNoteColor; updatedBy: string; version: { increment: number } } }): Promise<{ count: number }>
  findUniqueOrThrow(args: { where: NoteKey }): Promise<CalendarNote>
}
export type CalendarNoteDatabase = {
  calendarNote: NoteRepository
  $transaction<T>(fn: (tx: { calendarNote: NoteRepository; $queryRaw?: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> }) => Promise<T>): Promise<T>
}

export function validCalendarMonth(value: unknown): value is string {
  return typeof value === 'string' && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export function validCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !validCalendarMonth(value.slice(0, 7)) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

export function parseCalendarNoteInput(date: unknown, value: unknown): { date: string; body: string; title?: string; color?: CalendarNoteColor; expectedVersion: number | null } {
  if (!validCalendarDate(date) || !value || typeof value !== 'object' || Array.isArray(value)) throw new CalendarNoteError('invalid_calendar_note', 400)
  const { body, expectedVersion, title, color } = value as Record<string, unknown>
  if (typeof body !== 'string' || body.includes('\u0000') || Array.from(body).length > CALENDAR_NOTE_LIMIT
    || !(expectedVersion === null || typeof expectedVersion === 'number' && Number.isSafeInteger(expectedVersion) && expectedVersion >= 1)) {
    throw new CalendarNoteError('invalid_calendar_note', 400)
  }
  const normalized = body.replace(/\r\n?/g, '\n')
  if (color !== undefined && !isCalendarNoteColor(color)) throw new CalendarNoteError('invalid_calendar_note_color', 400)
  if (title !== undefined && (typeof title !== 'string' || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(title) || Array.from(title.trim()).length > CALENDAR_NOTE_TITLE_LIMIT)) throw new CalendarNoteError('invalid_calendar_note_title', 400)
  const normalizedTitle = typeof title === 'string' ? title.trim() : undefined
  if (!normalized.trim() && normalizedTitle) throw new CalendarNoteError('calendar_note_body_required', 400)
  // Omitted legacy title/color preserve saved values; clearing also resets the color.
  return { date, body: normalized.trim() ? normalized : '', title: normalized.trim() ? normalizedTitle : '', color: normalized.trim() ? color : 'yellow', expectedVersion: expectedVersion as number | null }
}

export async function saveCalendarNote(db: CalendarNoteDatabase, input: ReturnType<typeof parseCalendarNoteInput> & { brandId: string; actorId: string }) {
  const { brandId, date, body, title, color, expectedVersion, actorId } = input
  try {
    return await db.$transaction(async tx => {
      // Share the brand lock with planning saves so their final source check is atomic.
      if (tx.$queryRaw) await tx.$queryRaw`SELECT "id" FROM "Brand" WHERE "id"=${brandId} FOR UPDATE`
      if (expectedVersion === null) {
        return tx.calendarNote.create({ data: { brandId, date, title: title ?? '', body, color: color ?? 'yellow', createdBy: actorId, updatedBy: actorId } })
      }
      const updated = await tx.calendarNote.updateMany({
        where: { brandId, date, version: expectedVersion },
        data: { ...(title !== undefined ? { title } : {}), ...(color !== undefined ? { color } : {}), body, updatedBy: actorId, version: { increment: 1 } },
      })
      if (updated.count !== 1) throw new CalendarNoteError('calendar_note_conflict', 409)
      return tx.calendarNote.findUniqueOrThrow({ where: { brandId_date: { brandId, date } } })
    })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') throw new CalendarNoteError('calendar_note_conflict', 409)
    throw error
  }
}
