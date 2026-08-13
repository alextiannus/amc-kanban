// Backward-compatible alias. Existing schedulers can keep calling this route.
import { NextResponse } from 'next/server'
import { POST as unifiedGrowthSyncPost } from '../growth-sync/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return unifiedGrowthSyncPost(request)
}
