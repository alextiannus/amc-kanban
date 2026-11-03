import { calendarNotes } from '@/lib/calendarNotesServer'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; date: string }> }) {
  const { id, date } = await params
  return calendarNotes.PUT(request, id, date)
}
