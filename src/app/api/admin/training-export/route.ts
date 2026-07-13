import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/training-export
 *
 * Admin-only: Export annotated AI training data as JSONL or CSV.
 *
 * Query params:
 *   ?type=companion|copywriter|all   (default: all)
 *   ?trainingTag=include|exclude|needs_rewrite|any  (default: include)
 *   ?brandId=xxx
 *   ?startDate=2026-06-01
 *   ?endDate=2026-06-30
 *   ?format=jsonl|csv               (default: jsonl)
 *   ?limit=1000                     (max: 5000)
 *
 * JSONL format (OpenAI / GLM fine-tuning compatible):
 * {"messages": [
 *   {"role": "system", "content": "..."},
 *   {"role": "user",   "content": "..."},
 *   {"role": "assistant", "content": "..."}
 * ]}
 *
 * If correctedContent is set, the assistant turn uses correctedContent.
 * If trainingTag is 'exclude', the entry is skipped.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const type       = searchParams.get('type')        ?? 'all'
  const tagFilter  = searchParams.get('trainingTag') ?? 'include'
  const brandId    = searchParams.get('brandId')     ?? undefined
  const startDate  = searchParams.get('startDate')
  const endDate    = searchParams.get('endDate')
  const format     = searchParams.get('format')      ?? 'jsonl'
  const limit      = Math.min(5000, parseInt(searchParams.get('limit') ?? '1000', 10))

  const dateFilter = (startDate || endDate)
    ? {
        createdAt: {
          ...(startDate ? { gte: new Date(startDate) } : {}),
          ...(endDate   ? { lte: new Date(endDate)   } : {}),
        },
      }
    : {}

  // Determine trainingTag filter
  const tagWhere = tagFilter === 'any'
    ? { isAnnotated: true }
    : { trainingTag: tagFilter }

  const records: { type: string; jsonl: object; csv: Record<string, string> }[] = []

  // ── Companion messages ─────────────────────────────────────────────────────
  if (type === 'companion' || type === 'all') {
    // Fetch annotated assistant messages (pair with preceding user message)
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

      // Find the preceding user message in the same session/brand
      const userMsg = await prisma.companionMessage.findFirst({
        where: {
          brandId:   msg.brandId,
          userId:    msg.userId,
          sessionId: msg.sessionId,
          role:      'user',
          createdAt: { lt: msg.createdAt },
        },
        orderBy: { createdAt: 'desc' },
        select: { content: true, inputType: true },
      })

      const systemPrompt = `你是${msg.brand.name}的AI营销助手。${msg.brand.description ? `\n\n品牌简介：${msg.brand.description}` : ''}`
      const userContent   = userMsg?.content ?? '[无用户消息]'
      const assistantContent = msg.correctedContent ?? msg.content

      const jsonlEntry = {
        messages: [
          { role: 'system',    content: systemPrompt },
          { role: 'user',      content: userContent },
          { role: 'assistant', content: assistantContent },
        ],
        metadata: {
          source:      'companion',
          brandId:     msg.brandId,
          messageId:   msg.id,
          rating:      msg.rating,
          trainingTag: msg.trainingTag,
          isCorrected: !!msg.correctedContent,
          createdAt:   msg.createdAt.toISOString(),
        },
      }

      records.push({
        type: 'companion',
        jsonl: jsonlEntry,
        csv: {
          type:        'companion',
          id:          msg.id,
          brandId:     msg.brandId,
          rating:      String(msg.rating ?? ''),
          trainingTag: msg.trainingTag ?? '',
          isCorrected: msg.correctedContent ? 'yes' : 'no',
          adminNote:   msg.adminNote ?? '',
          system:      systemPrompt,
          user:        userContent,
          assistant:   assistantContent,
          createdAt:   msg.createdAt.toISOString(),
        },
      })
    }
  }

  // ── Copywriter logs ────────────────────────────────────────────────────────
  if (type === 'copywriter' || type === 'all') {
    const cwLogs = await prisma.copywriterLog.findMany({
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
        userId: true,
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

    for (const log of cwLogs) {
      if (log.trainingTag === 'exclude') continue

      const assistantContent = log.correctedContent ?? log.rawOutput

      const jsonlEntry = {
        messages: [
          { role: 'system',    content: log.systemPrompt },
          { role: 'user',      content: log.userInput },
          { role: 'assistant', content: assistantContent },
        ],
        metadata: {
          source:        'copywriter',
          brandId:       log.brandId,
          logId:         log.id,
          rating:        log.rating,
          trainingTag:   log.trainingTag,
          platform:      log.platform,
          promptVersion: log.promptVersion,
          isCorrected:   !!log.correctedContent,
          createdAt:     log.createdAt.toISOString(),
        },
      }

      records.push({
        type: 'copywriter',
        jsonl: jsonlEntry,
        csv: {
          type:          'copywriter',
          id:            log.id,
          brandId:       log.brandId,
          brandName:     log.brand.name,
          promptVersion: log.promptVersion ?? '',
          platform:      log.platform ?? '',
          modelId:       log.modelId ?? '',
          rating:        String(log.rating ?? ''),
          trainingTag:   log.trainingTag ?? '',
          isCorrected:   log.correctedContent ? 'yes' : 'no',
          adminNote:     log.adminNote ?? '',
          system:        log.systemPrompt,
          user:          log.userInput,
          assistant:     assistantContent,
          createdAt:     log.createdAt.toISOString(),
        },
      })
    }
  }

  const filename = `training_export_${type}_${new Date().toISOString().slice(0, 10)}`

  if (format === 'csv') {
    const headers = ['type','id','brandId','brandName','promptVersion','platform','modelId',
      'rating','trainingTag','isCorrected','adminNote','system','user','assistant','createdAt']
    const escape = (v: string) => `"${v.replace(/"/g, '""').replace(/\n/g, '\\n')}"`
    const rows = [
      headers.join(','),
      ...records.map(r => headers.map(h => escape(r.csv[h] ?? '')).join(',')),
    ]
    return new NextResponse(rows.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    })
  }

  // JSONL (default)
  const jsonl = records.map(r => JSON.stringify(r.jsonl)).join('\n')
  return new NextResponse(jsonl, {
    status: 200,
    headers: {
      'Content-Type': 'application/jsonl',
      'Content-Disposition': `attachment; filename="${filename}.jsonl"`,
      'X-Total-Records': String(records.length),
    },
  })
}
