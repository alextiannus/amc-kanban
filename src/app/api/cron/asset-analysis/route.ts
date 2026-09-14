import { NextResponse } from 'next/server'
import { processAnalysisQueue } from '@/lib/asset-analysis/service'

export const maxDuration = 240
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('x-cron-secret') !== process.env.CRON_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await processAnalysisQueue()
  return NextResponse.json({ ok: true })
}
