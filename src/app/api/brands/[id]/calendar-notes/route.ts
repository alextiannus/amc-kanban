import { calendarNotes } from '@/lib/calendarNotesServer'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return calendarNotes.GET(request, (await params).id)
}
