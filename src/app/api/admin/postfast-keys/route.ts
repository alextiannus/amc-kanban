import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { isAmcOperator } from '@/lib/amcOperator'
import {
  createPostfastPoolKeys,
  maskPostfastApiKey,
  POSTFAST_KEY_STATUSES,
  sanitizePostfastPoolRecords,
  type PostfastKeyStatus,
} from '@/lib/postfastKeyPool'

function isPostfastKeyStatus(value: unknown): value is PostfastKeyStatus {
  return POSTFAST_KEY_STATUSES.includes(value as PostfastKeyStatus)
}

async function requireAdmin() {
  const session = await getSession()
  if (!session?.user) return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isAmcOperator(session.user)) return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true as const, session }
}

async function withAssignedBrands(records: any[]) {
  const brandIds = Array.from(new Set(records.map((record) => record.assignedBrandId).filter(Boolean)))
  if (brandIds.length === 0) return records

  const brands = await prisma.brand.findMany({
    where: { id: { in: brandIds } },
    select: {
      id: true,
      name: true,
      owners: {
        where: { role: 'owner' },
        select: { user: { select: { id: true, email: true, nickname: true } } },
        take: 1,
      },
    },
  })
  const byId = new Map(brands.map((brand: any) => [brand.id, brand]))
  return records.map((record) => ({ ...record, assignedBrand: record.assignedBrandId ? byId.get(record.assignedBrandId) ?? null : null }))
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const records = await (prisma as any).postfastApiKeyPool.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  })
  const enriched = await withAssignedBrands(records)
  return NextResponse.json({ keys: sanitizePostfastPoolRecords(enriched) })
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const rawTokens = Array.isArray((body as any).tokens)
    ? (body as any).tokens
    : String((body as any).tokensText ?? '')
        .split(/\r?\n|,/)
        .map((item) => item.trim())
  const tokens = rawTokens.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
  if (tokens.length === 0) {
    return NextResponse.json({ error: '至少填写一个 PostFast API Key' }, { status: 400 })
  }

  const result = await createPostfastPoolKeys({
    tokens,
    label: typeof (body as any).label === 'string' ? (body as any).label : null,
    notes: typeof (body as any).notes === 'string' ? (body as any).notes : null,
    createdById: auth.session.user.id,
  })

  await prisma.auditLog.create({
    data: {
      actorId: auth.session.user.id,
      actorType: 'HUMAN',
      actorName: auth.session.user.email || null,
      action: 'POSTFAST_KEY_POOL_CREATED',
      resourceId: 'postfast-key-pool',
      resourceType: 'PostfastApiKeyPool',
      newValue: {
        createdCount: result.created.length,
        duplicates: result.duplicates,
        label: typeof (body as any).label === 'string' ? (body as any).label : null,
      },
    },
  })

  return NextResponse.json(result, { status: 201 })
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const id = typeof (body as any).id === 'string' ? (body as any).id.trim() : ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const current = await (prisma as any).postfastApiKeyPool.findUnique({ where: { id } })
  if (!current) return NextResponse.json({ error: 'PostFast key not found' }, { status: 404 })

  const status = (body as any).status
  if (status !== undefined && !isPostfastKeyStatus(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (current.status === 'ASSIGNED' && status === 'AVAILABLE') {
    return NextResponse.json({ error: '已分配的 key 不能直接改回可用，请先更换品牌配置。' }, { status: 400 })
  }

  const updated = await (prisma as any).postfastApiKeyPool.update({
    where: { id },
    data: {
      ...(typeof (body as any).label === 'string' ? { label: (body as any).label.trim() || null } : {}),
      ...(typeof (body as any).notes === 'string' ? { notes: (body as any).notes.trim() || null } : {}),
      ...(status ? { status } : {}),
    },
  })

  await prisma.auditLog.create({
    data: {
      actorId: auth.session.user.id,
      actorType: 'HUMAN',
      actorName: auth.session.user.email || null,
      action: 'POSTFAST_KEY_POOL_UPDATED',
      resourceId: id,
      resourceType: 'PostfastApiKeyPool',
      oldValue: { ...current, token: maskPostfastApiKey(current.token) },
      newValue: { ...updated, token: maskPostfastApiKey(updated.token) },
    },
  })

  return NextResponse.json({ key: sanitizePostfastPoolRecords([updated])[0] })
}
