import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const VALID_TAGS = ['include', 'exclude', 'needs_rewrite'] as const

export const maxDuration = 30

export async function POST(request: Request) {
  const expectedToken = process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim()
  const suppliedToken = request.headers.get('x-content-service-token')?.trim()
  if (!expectedToken || suppliedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    if (body.action === 'catalog') return NextResponse.json(await getCatalogData())
    if (body.action === 'logs') return NextResponse.json(await getLogs(body))
    if (body.action === 'annotateLog') return NextResponse.json(await annotateLog(body))
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (error) {
    console.error('[content-lab-admin] failed:', error)
    return NextResponse.json({ error: 'Content Lab admin request failed' }, { status: 500 })
  }
}

async function getCatalogData() {
  const brands = await prisma.brand.findMany({
    where: { status: { not: 'ARCHIVED' } },
    select: {
      id: true,
      name: true,
      description: true,
      location: true,
      address: true,
      website: true,
      phone: true,
      updatedAt: true,
      knowledge: {
        select: {
          brandTone: true,
          negPrompts: true,
          slangDict: true,
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 100,
  })
  return { brands }
}

async function getLogs(body: any) {
  const page = Math.max(1, intValue(body.page, 1))
  const limit = Math.min(50, intValue(body.limit, 25))
  const brandId = optionalString(body.brandId)
  const trainingTag = optionalString(body.trainingTag)
  const isAnnotated = typeof body.isAnnotated === 'boolean' ? body.isAnnotated : undefined

  const where = {
    ...(brandId ? { brandId } : {}),
    ...(isAnnotated !== undefined ? { isAnnotated } : {}),
    ...(trainingTag ? { trainingTag } : {}),
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
        systemPrompt: true,
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

  return { logs, total, page, limit }
}

async function annotateLog(body: any) {
  const id = optionalString(body.id)
  if (!id) throw new Error('id is required')

  const rating = typeof body.rating === 'number' ? body.rating : undefined
  const trainingTag = optionalString(body.trainingTag)
  if (rating !== undefined && (rating < 1 || rating > 3)) {
    throw new Error('rating must be 1, 2, or 3')
  }
  if (trainingTag !== undefined && !VALID_TAGS.includes(trainingTag as (typeof VALID_TAGS)[number])) {
    throw new Error(`trainingTag must be one of: ${VALID_TAGS.join(', ')}`)
  }

  const log = await prisma.copywriterLog.update({
    where: { id },
    data: {
      ...(rating !== undefined ? { rating } : {}),
      ...(typeof body.adminNote === 'string' ? { adminNote: body.adminNote } : {}),
      ...(typeof body.correctedContent === 'string' ? { correctedContent: body.correctedContent } : {}),
      ...(trainingTag !== undefined ? { trainingTag } : {}),
      isAnnotated: true,
    },
    select: {
      id: true,
      rating: true,
      adminNote: true,
      correctedContent: true,
      isAnnotated: true,
      trainingTag: true,
    },
  })
  return { ok: true, log }
}

function intValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
