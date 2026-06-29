import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBrandAccessType } from '@/lib/brandAccess'

// Retention: 150 days as per design decision (2026-06-29)
const RETENTION_DAYS = 150

interface MessagePayload {
  role: 'user' | 'assistant'
  content: string
  action?: string
  draftId?: string
  // New metadata fields (v1.6)
  inputType?: string      // 'text' | 'voice'
  modelId?: string        // 'glm-4-flash' etc.
  latencyMs?: number
  tokenEstimate?: number
  intentDetected?: string
}

interface BatchEntry {
  brandId?: string  // optional — server uses route param
  sessionId?: string
  messages: MessagePayload[]
}

/**
 * POST /api/brands/[id]/companion/history
 *
 * Non-blocking distributed design (v1.6):
 * - Responds 202 Accepted IMMEDIATELY
 * - DB write runs as unawaited Promise (zero latency to caller)
 * - Accepts both legacy { messages } and new { batch } formats
 *
 * New batch format:
 *   { batch: [{ sessionId, messages: [...] }] }
 *
 * Legacy format (backwards compatible):
 *   { messages: [{ role, content, action?, draftId? }] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: brandId } = await params

  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify brand access (brand owner or admin)
  const accessType = await getBrandAccessType(brandId, session.user.id, session.user.type || 'HUMAN')
  if (!accessType) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const userId = session.user.id

  // --- 202 Accepted immediately, DB write is non-blocking ---
  writeConversationLog(userId, brandId, body).catch((err) => {
    console.error('[ConversationLog] write failed (non-critical):', err)
  })

  return NextResponse.json({ accepted: true }, { status: 202 })
}

/**
 * Async DB write — runs after 202 is already returned.
 * Handles both legacy { messages } and new { batch } formats.
 */
async function writeConversationLog(
  userId: string,
  brandId: string,
  body: { messages?: MessagePayload[]; batch?: BatchEntry[] }
) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  // Normalise to batch format
  let entries: BatchEntry[]
  if (body.batch && Array.isArray(body.batch)) {
    entries = body.batch
  } else if (body.messages && Array.isArray(body.messages)) {
    // Legacy format: wrap in a single batch entry (no sessionId)
    entries = [{ messages: body.messages }]
  } else {
    return // Nothing to write
  }

  for (const entry of entries) {
    if (!entry.messages?.length) continue

    let sessionId: string | undefined = entry.sessionId

    // Upsert session if sessionId is provided
    if (sessionId) {
      await prisma.companionSession.upsert({
        where: { id: sessionId },
        create: {
          id: sessionId,
          brandId,
          userId,
          messageCount: entry.messages.length,
        },
        update: {
          messageCount: { increment: entry.messages.length },
          lastActiveAt: new Date(),
        },
      })
    }

    await prisma.companionMessage.createMany({
      data: entry.messages.map((m) => ({
        brandId,
        userId,
        sessionId:      sessionId ?? null,
        role:           m.role,
        content:        m.content.slice(0, 5000), // safety truncation
        action:         m.action ?? null,
        draftId:        m.draftId ?? null,
        inputType:      m.inputType ?? null,
        modelId:        m.modelId ?? null,
        latencyMs:      m.latencyMs ?? null,
        tokenEstimate:  m.tokenEstimate ?? null,
        intentDetected: m.intentDetected ?? null,
      })),
    })
  }

  // Background retention cleanup (150 days)
  prisma.companionMessage
    .deleteMany({ where: { brandId, userId, createdAt: { lt: cutoff } } })
    .catch(() => {})
}

/**
 * GET /api/brands/[id]/companion/history
 *
 * Admin-only: Returns paginated conversation messages for a brand.
 * Query params: ?sessionId=xxx | ?page=1&limit=50 | ?startDate=xxx&endDate=xxx
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: brandId } = await params

  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Admin-only access
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden — Admin only' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId') ?? undefined
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  const where = {
    brandId,
    ...(sessionId ? { sessionId } : {}),
    ...(startDate || endDate
      ? {
          createdAt: {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate ? { lte: new Date(endDate) } : {}),
          },
        }
      : {}),
  }

  const [messages, total] = await Promise.all([
    prisma.companionMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        action: true,
        draftId: true,
        sessionId: true,
        inputType: true,
        modelId: true,
        latencyMs: true,
        tokenEstimate: true,
        intentDetected: true,
        createdAt: true,
        userId: true,
      },
    }),
    prisma.companionMessage.count({ where }),
  ])

  return NextResponse.json({ messages, total, page, limit })
}
