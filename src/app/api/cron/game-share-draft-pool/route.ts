import { NextResponse } from 'next/server'
import { processGameShareDraftPoolQueue } from '@/lib/gameShareDraftPool'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) {
    console.warn('[Game Share Draft Pool Cron] Unauthorized attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const results = await processGameShareDraftPoolQueue(10)
    return NextResponse.json({ processed: results.length, results })
  } catch (error) {
    console.error('[Game Share Draft Pool Cron]', error)
    const message = error instanceof Error ? error.message : 'Unable to process sharing draft pool'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
