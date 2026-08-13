import { NextResponse } from 'next/server'
import { processPendingBrandGrowthSync } from '@/lib/brandGrowthSync'
import { processPendingIdentityChanges } from '@/lib/brandIdentitySync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Configure the platform scheduler to call this route every five minutes.
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) {
    console.warn('[Growth Sync Cron] Unauthorized attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const snapshots = await processPendingBrandGrowthSync(20)
    const identity = await processPendingIdentityChanges(20)
    return NextResponse.json({
      ok: true,
      snapshots,
      identity: {
        processed: identity.length,
        published: identity.filter(item => item.state === 'published').length,
        pending: identity.filter(item => item.state === 'pending_sync').length,
        conflicts: identity.filter(item => item.state === 'sync_conflict').length,
      },
    })
  } catch (error) {
    console.error('[Growth Sync Cron]', error)
    return NextResponse.json({ error: 'Unable to process Growth sync queues' }, { status: 500 })
  }
}
