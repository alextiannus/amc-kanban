import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBrandAccessType } from '@/lib/brandAccess'

// Retention: 150 days (same as CompanionMessage)
const RETENTION_DAYS = 150

interface CopywriterLogPayload {
  systemPrompt:  string
  userInput:     string
  rawOutput:     string
  modelId?:      string
  latencyMs?:    number
  tokenEstimate?: number
  platform?:     string
  draftId?:      string
  promptVersion?: string
}

/**
 * POST /api/brands/[id]/copywriter-log
 *
 * Non-blocking distributed design (same pattern as companion/history):
 * - Responds 202 Accepted IMMEDIATELY
 * - DB write runs as unawaited Promise
 *
 * Body: { systemPrompt, userInput, rawOutput, modelId?, latencyMs?,
 *         tokenEstimate?, platform?, draftId?, promptVersion? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: brandId } = await params

  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessType = await getBrandAccessType(brandId, session.user.id, session.user.type || 'HUMAN')
  if (!accessType) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json() as CopywriterLogPayload

  // 202 immediately, write async
  writeCopywriterLog(session.user.id, brandId, body).catch((err) => {
    console.error('[CopywriterLog] write failed (non-critical):', err)
  })

  return NextResponse.json({ accepted: true }, { status: 202 })
}

async function writeCopywriterLog(
  userId: string,
  brandId: string,
  payload: CopywriterLogPayload
) {
  await prisma.copywriterLog.create({
    data: {
      brandId,
      userId,
      systemPrompt:  payload.systemPrompt.slice(0, 20000),  // safety cap
      userInput:     payload.userInput.slice(0, 5000),
      rawOutput:     payload.rawOutput.slice(0, 20000),
      modelId:       payload.modelId     ?? null,
      latencyMs:     payload.latencyMs   ?? null,
      tokenEstimate: payload.tokenEstimate ?? null,
      platform:      payload.platform    ?? null,
      draftId:       payload.draftId     ?? null,
      promptVersion: payload.promptVersion ?? null,
    },
  })

  // Retention cleanup (150 days, background)
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  prisma.copywriterLog
    .deleteMany({ where: { brandId, createdAt: { lt: cutoff } } })
    .catch(() => {})
}
