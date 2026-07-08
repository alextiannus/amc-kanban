import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const VALID_TAGS = ['include', 'exclude', 'needs_rewrite'] as const

export const maxDuration = 30

export async function POST(request: Request) {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')

  const expectedToken = process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim()
    || (isLocal ? 'local-internal-token' : undefined)
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
    if (body.action === 'trainingExport') return NextResponse.json(await exportTrainingData(body))
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

async function exportTrainingData(body: any) {
  const type = optionalString(body.type) ?? 'all'
  const tagFilter = optionalString(body.trainingTag) ?? 'include'
  const brandId = optionalString(body.brandId)
  const startDate = optionalString(body.startDate)
  const endDate = optionalString(body.endDate)
  const format = optionalString(body.format) ?? 'jsonl'
  const limit = Math.min(5000, intValue(body.limit, 1000))
  const dateFilter = startDate || endDate
    ? {
        createdAt: {
          ...(startDate ? { gte: new Date(startDate) } : {}),
          ...(endDate ? { lte: new Date(endDate) } : {}),
        },
      }
    : {}
  const tagWhere = tagFilter === 'any'
    ? { isAnnotated: true }
    : { trainingTag: tagFilter }
  const records: { jsonl: object; csv: Record<string, string> }[] = []

  if (type === 'companion' || type === 'all') {
    const assistantMessages = await prisma.companionMessage.findMany({
      where: {
        role: 'assistant',
        ...tagWhere,
        ...(brandId ? { brandId } : {}),
        ...dateFilter,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        brandId: true,
        userId: true,
        sessionId: true,
        content: true,
        correctedContent: true,
        rating: true,
        adminNote: true,
        trainingTag: true,
        createdAt: true,
        brand: { select: { name: true, description: true } },
      },
    })

    for (const msg of assistantMessages) {
      if (msg.trainingTag === 'exclude') continue
      const userMsg = await prisma.companionMessage.findFirst({
        where: {
          brandId: msg.brandId,
          userId: msg.userId,
          sessionId: msg.sessionId,
          role: 'user',
          createdAt: { lt: msg.createdAt },
        },
        orderBy: { createdAt: 'desc' },
        select: { content: true },
      })
      const systemPrompt = `你是${msg.brand.name}的AI营销助手。${msg.brand.description ? `\n\n品牌简介：${msg.brand.description}` : ''}`
      const userContent = userMsg?.content ?? '[无用户消息]'
      const assistantContent = msg.correctedContent ?? msg.content
      records.push({
        jsonl: {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
            { role: 'assistant', content: assistantContent },
          ],
          metadata: {
            source: 'companion',
            brandId: msg.brandId,
            messageId: msg.id,
            rating: msg.rating,
            trainingTag: msg.trainingTag,
            isCorrected: !!msg.correctedContent,
            createdAt: msg.createdAt.toISOString(),
          },
        },
        csv: {
          type: 'companion',
          id: msg.id,
          brandId: msg.brandId,
          brandName: msg.brand.name,
          rating: String(msg.rating ?? ''),
          trainingTag: msg.trainingTag ?? '',
          isCorrected: msg.correctedContent ? 'yes' : 'no',
          adminNote: msg.adminNote ?? '',
          system: systemPrompt,
          user: userContent,
          assistant: assistantContent,
          createdAt: msg.createdAt.toISOString(),
        },
      })
    }
  }

  if (type === 'copywriter' || type === 'all') {
    const logs = await prisma.copywriterLog.findMany({
      where: {
        ...tagWhere,
        ...(brandId ? { brandId } : {}),
        ...dateFilter,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        brandId: true,
        promptVersion: true,
        systemPrompt: true,
        userInput: true,
        rawOutput: true,
        correctedContent: true,
        rating: true,
        adminNote: true,
        trainingTag: true,
        platform: true,
        modelId: true,
        createdAt: true,
        brand: { select: { name: true } },
      },
    })

    for (const log of logs) {
      if (log.trainingTag === 'exclude') continue
      const rejectedText = extractCaption(log.rawOutput)
      const assistantContent = log.correctedContent ?? log.rawOutput
      const chosenText = log.correctedContent ?? rejectedText
      const metadata = {
        brandId: log.brandId,
        logId: log.id,
        rating: log.rating,
        trainingTag: log.trainingTag,
        platform: log.platform,
        promptVersion: log.promptVersion,
        createdAt: log.createdAt.toISOString(),
      }
      records.push({
        jsonl: format === 'jsonl_dpo'
          ? {
              prompt: log.userInput,
              system: log.systemPrompt,
              chosen: chosenText,
              rejected: rejectedText,
              metadata: { source: 'copywriter_dpo', ...metadata },
            }
          : {
              messages: [
                { role: 'system', content: log.systemPrompt },
                { role: 'user', content: log.userInput },
                { role: 'assistant', content: assistantContent },
              ],
              metadata: { source: 'copywriter', isCorrected: !!log.correctedContent, ...metadata },
            },
        csv: {
          type: format === 'jsonl_dpo' ? 'copywriter_dpo' : 'copywriter',
          id: log.id,
          brandId: log.brandId,
          brandName: log.brand.name,
          promptVersion: log.promptVersion ?? '',
          platform: log.platform ?? '',
          modelId: log.modelId ?? '',
          rating: String(log.rating ?? ''),
          trainingTag: log.trainingTag ?? '',
          isCorrected: log.correctedContent ? 'yes' : 'no',
          adminNote: log.adminNote ?? '',
          system: log.systemPrompt,
          user: log.userInput,
          assistant: format === 'jsonl_dpo' ? chosenText : assistantContent,
          createdAt: log.createdAt.toISOString(),
        },
      })
    }
  }

  const baseName = `training_export_${type}_${new Date().toISOString().slice(0, 10)}`
  if (format === 'csv') {
    const headers = ['type', 'id', 'brandId', 'brandName', 'promptVersion', 'platform', 'modelId', 'rating', 'trainingTag', 'isCorrected', 'adminNote', 'system', 'user', 'assistant', 'createdAt']
    const content = [
      headers.join(','),
      ...records.map((record) => headers.map((header) => csvEscape(record.csv[header] ?? '')).join(',')),
    ].join('\n')
    return {
      content,
      contentType: 'text/csv; charset=utf-8',
      filename: `${baseName}.csv`,
      totalRecords: records.length,
    }
  }

  return {
    content: records.map((record) => JSON.stringify(record.jsonl)).join('\n'),
    contentType: 'application/jsonl',
    filename: `${baseName}.jsonl`,
    totalRecords: records.length,
  }
}

function extractCaption(rawOutput: string): string {
  try {
    const cleanJson = rawOutput.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleanJson)
    return typeof parsed?.caption === 'string' ? parsed.caption : rawOutput
  } catch {
    return rawOutput
  }
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/\n/g, '\\n')}"`
}

function intValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
