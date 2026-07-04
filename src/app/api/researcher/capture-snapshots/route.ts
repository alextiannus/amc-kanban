import { NextResponse } from 'next/server'
import { runDailySnapshotCrawler } from '@/lib/captureSnapshots'
import { authenticateRequest, hasCapability } from '@/lib/auth-v2'

export async function POST(request: Request) {
  const principal = await authenticateRequest(request)
  if (!principal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasCapability(principal.globalRoles, 'brand.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Run the crawler asynchronously in the background so the request returns immediately
    runDailySnapshotCrawler()
      .then((res) => {
        console.log(`[AMC Researcher] Daily crawler completed: success=${res.successCount}, failed=${res.failedCount}`)
      })
      .catch((err) => {
        console.error('[AMC Researcher] Daily crawler failed:', err)
      })

    return NextResponse.json({ message: 'Daily screenshot crawler triggered successfully' }, { status: 202 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to trigger crawler' }, { status: 500 })
  }
}
