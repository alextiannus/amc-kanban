import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runDailySnapshotCrawler } from '@/lib/captureSnapshots'

export async function POST(request: Request) {
  // Authorization check (support session for human admins and API Key for AI Researcher)
  let authorized = false

  const session = await getSession()
  if (session?.user) {
    // Check if human is admin or principal
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { businessRoles: true },
    })
    const isOwnerOrAdmin = user?.role === 'ADMIN' || user?.businessRoles.some(r => r.role === 'BRAND_OWNER' || r.role === 'BRAND_DIRECTOR' || r.role === 'AMC_PRINCIPAL')
    if (isOwnerOrAdmin) {
      authorized = true
    }
  }

  if (!authorized) {
    const authHeader = request.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const apiKey = authHeader.substring(7)
      const agent = await prisma.user.findFirst({
        where: { apiKey, type: 'AI_AGENT' },
      })
      if (agent) {
        authorized = true
      }
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
