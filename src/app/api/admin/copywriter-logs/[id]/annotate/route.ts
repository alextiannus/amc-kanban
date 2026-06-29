import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_TAGS = ['include', 'exclude', 'needs_rewrite'] as const

/**
 * PATCH /api/admin/copywriter-logs/[id]/annotate
 *
 * Admin-only: Annotate a CopywriterLog entry for AI training.
 * Body: { rating?, adminNote?, correctedContent?, trainingTag? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { rating, adminNote, correctedContent, trainingTag } = body as {
    rating?: number
    adminNote?: string
    correctedContent?: string
    trainingTag?: string
  }

  if (rating !== undefined && (rating < 1 || rating > 3)) {
    return NextResponse.json({ error: 'rating must be 1, 2, or 3' }, { status: 400 })
  }
  if (trainingTag !== undefined && !VALID_TAGS.includes(trainingTag as (typeof VALID_TAGS)[number])) {
    return NextResponse.json({ error: `trainingTag must be one of: ${VALID_TAGS.join(', ')}` }, { status: 400 })
  }

  const updated = await prisma.copywriterLog.update({
    where: { id },
    data: {
      ...(rating           !== undefined ? { rating }           : {}),
      ...(adminNote        !== undefined ? { adminNote }        : {}),
      ...(correctedContent !== undefined ? { correctedContent } : {}),
      ...(trainingTag      !== undefined ? { trainingTag }      : {}),
      isAnnotated: true,
    },
    select: {
      id: true, rating: true, adminNote: true,
      correctedContent: true, isAnnotated: true, trainingTag: true,
    },
  })

  return NextResponse.json({ ok: true, log: updated })
}
