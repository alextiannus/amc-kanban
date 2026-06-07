import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

// GET /api/admin/logs?limit=100&level=all&action=all
export async function GET(req: Request) {
  const session = await getSession()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 500)
  const action = url.searchParams.get('action') || 'all'
  const resourceType = url.searchParams.get('resourceType') || 'all'

  const where: Prisma.AuditLogWhereInput = {}
  if (action !== 'all') where.action = action
  if (resourceType !== 'all') where.resourceType = resourceType

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limit,
  })

  return NextResponse.json({ logs, total: logs.length })
}
