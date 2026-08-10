import { NextResponse } from 'next/server'
import { processPendingIdentityChanges } from '@/lib/brandIdentitySync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Schedule every five minutes and send x-cron-secret matching CRON_SECRET.
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) {
    console.warn('[Brand Identity Sync Cron] Unauthorized attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const results = await processPendingIdentityChanges(20)
    return NextResponse.json({
      processed: results.length,
      published: results.filter(result => result.state === 'published').length,
      pending: results.filter(result => result.state === 'pending_sync').length,
      conflicts: results.filter(result => result.state === 'sync_conflict').length,
      results,
    })
  } catch (error) {
    console.error('[Brand Identity Sync Cron]', error)
    return NextResponse.json({ error: 'Unable to process brand identity sync queue' }, { status: 500 })
  }
}
