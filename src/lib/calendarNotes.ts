export const CALENDAR_NOTE_LIMIT = 2000

export class CalendarNoteError extends Error {
  constructor(public code: string, public status: number) { super(code) }
}

export type CalendarNote = {
  id: string
  brandId: string
  date: string
  body: string
  version: number
  createdBy: string
  updatedBy: string
  createdAt: Date
  updatedAt: Date
}

type NoteKey = { brandId_date: { brandId: string; date: string } }
type NoteRepository = {
  findMany(args: { where: { brandId: string; date: { startsWith: string } }; orderBy: { date: 'asc' } }): Promise<CalendarNote[]>
  create(args: { data: { brandId: string; date: string; body: string; createdBy: string; updatedBy: string } }): Promise<CalendarNote>
  updateMany(args: { where: { brandId: string; date: string; version: number }; data: { body: string; updatedBy: string; version: { increment: number } } }): Promise<{ count: number }>
  findUniqueOrThrow(args: { where: NoteKey }): Promise<CalendarNote>
}
export type CalendarNoteDatabase = {
  calendarNote: NoteRepository
  $transaction<T>(fn: (tx: { calendarNote: NoteRepository }) => Promise<T>): Promise<T>
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

export function parseCalendarNoteInput(date: unknown, value: unknown) {
  if (!validCalendarDate(date) || !value || typeof value !== 'object' || Array.isArray(value)) throw new CalendarNoteError('invalid_calendar_note', 400)
  const { body, expectedVersion } = value as Record<string, unknown>
  if (typeof body !== 'string' || body.includes('\u0000') || Array.from(body).length > CALENDAR_NOTE_LIMIT
    || !(expectedVersion === null || typeof expectedVersion === 'number' && Number.isSafeInteger(expectedVersion) && expectedVersion >= 1)) {
    throw new CalendarNoteError('invalid_calendar_note', 400)
  }
  const normalized = body.replace(/\r\n?/g, '\n')
  return { date, body: normalized.trim() ? normalized : '', expectedVersion: expectedVersion as number | null }
}

export async function saveCalendarNote(db: CalendarNoteDatabase, input: ReturnType<typeof parseCalendarNoteInput> & { brandId: string; actorId: string }) {
  const { brandId, date, body, expectedVersion, actorId } = input
  try {
    return await db.$transaction(async tx => {
      if (expectedVersion === null) {
        return tx.calendarNote.create({ data: { brandId, date, body, createdBy: actorId, updatedBy: actorId } })
      }
      const updated = await tx.calendarNote.updateMany({
        where: { brandId, date, version: expectedVersion },
        data: { body, updatedBy: actorId, version: { increment: 1 } },
      })
      if (updated.count !== 1) throw new CalendarNoteError('calendar_note_conflict', 409)
      return tx.calendarNote.findUniqueOrThrow({ where: { brandId_date: { brandId, date } } })
    })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') throw new CalendarNoteError('calendar_note_conflict', 409)
    throw error
  }
}
