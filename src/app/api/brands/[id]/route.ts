import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject, canWriteBrandProject } from '@/lib/brandAccess'
import { refreshBrandProfileMarkdown } from '@/lib/brandProfileMarkdown'

type Params = { params: Promise<{ id: string }> }

// GET /api/brands/[id] — brand detail with accounts, pending counts, conversion summary, recent drafts
// PostFast data (postfastSnapshot) is populated nightly by /api/cron/postfast-sync-all — no external calls here.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const ok = await canSessionAccessBrandProject(
    id,
    session.user.id,
    session.user.type ?? 'HUMAN',
    session.user.role
  )
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const brand = await prisma.brand.findFirst({
    where: { id },
    include: {
      accounts: {
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, platformId: true, handle: true, displayName: true,
          autoPilot: true, followerCount: true, followerDelta: true,
          ratingScore: true, snapshotAt: true,
          profileUrl: true,   // public URL — safe to expose
          expiresAt: true,
          // loginUsername / loginPassword intentionally excluded (admin-only via /api/admin/brand-credentials)
        },
      },
      actionItems: {
        where: { status: 'pending' },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        include: {
          account: { select: { platformId: true, handle: true } },
          draft: { select: { id: true, caption: true, scheduledAt: true, mediaUrls: true } },
        },
      },
      _count: {
        select: {
          actionItems: { where: { status: 'pending' } },
          contents: { where: { status: 'pending_review' } },
          assets: true,
        },
      },
    },
  })

  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Week conversion summary
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const conversions = await prisma.conversionEvent.groupBy({
    by: ['type', 'source'],
    where: { brandId: id, occurredAt: { gte: weekAgo } },
    _count: { id: true },
  })

  // Recent drafts (last 10) for activity feed — ordered by most recent update
  const recentDrafts = await prisma.contentDraft.findMany({
    where: { brandId: id },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    include: {
      account: { select: { platformId: true, handle: true } },
    },
  })

  // PostFast data is synced nightly by /api/cron/postfast-sync-all.
  // Read from DB — never call PostFast in this request path.
  const snapshot = (brand as any).postfastSnapshot as { accounts?: any[]; operationsReport?: any } | null
  const operationsReport = snapshot?.operationsReport ?? null
  const postfastSyncedAt = (brand as any).postfastSyncedAt ?? null

  return NextResponse.json({ ...brand, weekConversions: conversions, recentDrafts, operationsReport, postfastSyncedAt })
}

// PATCH /api/brands/[id] — update editable brand profile fields
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!(await canWriteBrandProject(id, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json()
  const { name, description, logoUrl, location, timezone, autoPilot, address, phone, website } = body

  const nextDescription = description !== undefined
    ? (typeof description === 'string' ? description.trim() || null : description)
    : undefined

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const currentBrand = description !== undefined
      ? await tx.brand.findUnique({ where: { id }, select: { description: true } })
      : null
    const result = await tx.brand.update({
      where: { id },
      data: {
      ...(name !== undefined && { name: typeof name === 'string' ? name.trim() : name }),
      ...(description !== undefined && { description: nextDescription }),
      ...(logoUrl !== undefined && {
        logoUrl: typeof logoUrl === 'string' ? logoUrl.trim() || null : logoUrl,
      }),
      ...(location !== undefined && {
        location: typeof location === 'string' ? location.trim() || null : location,
      }),
      ...(address !== undefined && {
        address: typeof address === 'string' ? address.trim() || null : address,
      }),
      ...(phone !== undefined && {
        phone: typeof phone === 'string' ? phone.trim() || null : phone,
      }),
      ...(website !== undefined && {
        website: typeof website === 'string' ? website.trim() || null : website,
      }),
      ...(timezone !== undefined && { timezone }),
      ...(autoPilot !== undefined && { autoPilot }),
      },
    })
    if (description !== undefined && currentBrand?.description !== nextDescription) {
      await tx.auditLog.create({
        data: {
          actorId: session.user.id,
          actorType: session.user.type || 'HUMAN',
          actorName: session.user.email || null,
          action: 'BRAND_STORY_UPDATED',
          resourceId: id,
          resourceType: 'Brand',
          oldValue: { description: currentBrand?.description || null },
          newValue: { description: nextDescription || null },
          metadata: { brandId: id, field: 'description', source: 'kanban' },
        },
      })
    }
    return result
  })

  if (autoPilot !== undefined) {
    await prisma.socialAccount.updateMany({
      where: { brandId: id },
      data: { autoPilot },
    })
  }

  try {
    await refreshBrandProfileMarkdown(id)
  } catch {
    // non-fatal — brand update should not fail due to profile markdown refresh
  }

  return NextResponse.json(updated)
}

// DELETE /api/brands/[id] — soft-delete by archiving brand
export async function DELETE(_request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!(await canWriteBrandProject(id, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const existing = await prisma.brand.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.status === 'ARCHIVED') {
    return NextResponse.json({ ok: true, alreadyArchived: true })
  }

  const activeSub = await prisma.brandSubscription.findFirst({
    where: {
      brandId: id,
      status: 'ACTIVE',
      OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }],
    },
  })
  if (activeSub) {
    return NextResponse.json(
      { error: 'Cannot archive a brand with an active subscription. Please cancel or wait for the subscription to expire first.' },
      { status: 400 }
    )
  }

  const archived = await prisma.$transaction(async (tx: any) => {
    const updatedBrand = await tx.brand.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    })

    await tx.brandAgent.updateMany({
      where: { brandId: id, active: true },
      data: { active: false },
    })

    await tx.auditLog.create({
      data: {
        actorId: session.user.id,
        actorType: 'HUMAN',
        actorName: session.user.email || null,
        action: 'BRAND_ARCHIVED',
        resourceId: updatedBrand.id,
        resourceType: 'Brand',
        oldValue: { status: existing.status },
        newValue: { status: updatedBrand.status },
      },
    })

    return updatedBrand
  })

  return NextResponse.json(archived)
}
