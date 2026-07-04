import { NextResponse } from 'next/server'
import type { PlatformType } from 'amc-content'
import { prisma } from '@/lib/prisma'

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

  const brandId = stringOrEmpty(body.brandId)
  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true },
  })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  const promptVersion = optionalString(body.promptVersion)
  const provenance = body.provenance && typeof body.provenance === 'object' ? body.provenance : undefined
  const log = await prisma.copywriterLog.create({
    data: {
      brandId,
      userId: optionalString(body.actorId) || 'amc-content-service',
      promptVersion,
      systemPrompt: stringifyForLog({
        engine: 'amc-content-remote',
        promptVersion,
        actorType: optionalString(body.actorType),
        actorRole: optionalString(body.actorRole),
        provenance,
      }, 20000),
      userInput: stringifyForLog(body.input ?? {}, 5000),
      rawOutput: stringifyForLog({
        output: body.output ?? {},
        quality: body.quality,
        provenance,
      }, 20000),
      modelId: optionalString(body.modelId),
      latencyMs: optionalInt(body.latencyMs),
      tokenEstimate: optionalInt(body.tokenEstimate),
      platform: normalizePlatform(body.platform),
      draftId: optionalString(body.draftId),
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, logId: log.id })
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalString(value: unknown): string | undefined {
  const text = stringOrEmpty(value)
  return text || undefined
}

function optionalInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.round(value)
}

function normalizePlatform(value: unknown): PlatformType | undefined {
  const text = stringOrEmpty(value)
  return text ? text as PlatformType : undefined
}

function stringifyForLog(value: unknown, maxLength: number): string {
  try {
    return JSON.stringify(value).slice(0, maxLength)
  } catch {
    return String(value ?? '').slice(0, maxLength)
  }
}
