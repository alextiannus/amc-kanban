import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_TAGS = ['include', 'exclude', 'needs_rewrite'] as const

/**
 * GET /api/admin/copywriter-logs
 *
 * Admin-only: Paginated list of CopywriterLog entries.
 * Query params: ?brandId=&page=1&limit=20&isAnnotated=&trainingTag=&startDate=&endDate=
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const brandId      = searchParams.get('brandId')      ?? undefined
  const isAnnotated  = searchParams.get('isAnnotated')
  const trainingTag  = searchParams.get('trainingTag')  ?? undefined
  const startDate    = searchParams.get('startDate')
  const endDate      = searchParams.get('endDate')
  const page         = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
  const limit        = Math.min(50, parseInt(searchParams.get('limit') ?? '20', 10))

  const where = {
    ...(brandId ? { brandId } : {}),
    ...(isAnnotated !== null ? { isAnnotated: isAnnotated === 'true' } : {}),
    ...(trainingTag ? { trainingTag } : {}),
    ...(startDate || endDate
      ? {
          createdAt: {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate   ? { lte: new Date(endDate)   } : {}),
          },
        }
      : {}),
  }

  const [logs, total] = await Promise.all([
    prisma.copywriterLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        brandId: true,
        userId: true,
        promptVersion: true,
        systemPrompt: true,     // included for annotation UI
        userInput: true,
        rawOutput: true,
        modelId: true,
        latencyMs: true,
        tokenEstimate: true,
        platform: true,
        draftId: true,
        createdAt: true,
        rating: true,
        adminNote: true,
        correctedContent: true,
        isAnnotated: true,
        trainingTag: true,
        brand: { select: { name: true } },
      },
    }),
    prisma.copywriterLog.count({ where }),
  ])

  return NextResponse.json({ logs, total, page, limit })
}

/**
 * PATCH /api/admin/copywriter-logs/[id]/annotate — handled in sub-route
 * This file only handles listing.
 */
