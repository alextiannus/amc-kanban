import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isBrandAdminStatus, requireAdminAgent } from '@/lib/agentAdmin'
import { refreshBrandProfileMarkdown } from '@/lib/brandProfileMarkdown'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAdminAgent(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const brand = await prisma.brand.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      name: true,
      description: true,
      location: true,
      timezone: true,
      autoPilot: true,
      status: true,
      website: true,
      phone: true,
      address: true,
      createdAt: true,
      updatedAt: true,
      owners: {
        select: {
          user: {
            select: {
              id: true,
              email: true,
              nickname: true,
              role: true,
            },
          },
        },
      },
      brandAgents: {
        select: {
          id: true,
          role: true,
          active: true,
          agent: {
            select: {
              id: true,
              email: true,
              nickname: true,
            },
          },
        },
        orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      },
      _count: {
        select: {
          accounts: true,
          contents: true,
          assets: true,
          actionItems: true,
          conversions: true,
          gameSessions: true,
        },
      },
    },
  })

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  return NextResponse.json({ brand, adminAgent: auth.context.agent })
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdminAgent(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await request.json()

  const requestedStatus = body.status === undefined ? undefined : String(body.status).trim().toUpperCase()
  const requestedAutoPilot = body.autoPilot
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null

  if (requestedStatus !== undefined && !isBrandAdminStatus(requestedStatus)) {
    return NextResponse.json({ error: 'Invalid brand status' }, { status: 400 })
  }

  if (requestedStatus === undefined && requestedAutoPilot === undefined) {
    return NextResponse.json({ error: 'At least one of status or autoPilot is required' }, { status: 400 })
  }

  if (requestedAutoPilot !== undefined && typeof requestedAutoPilot !== 'boolean') {
    return NextResponse.json({ error: 'autoPilot must be a boolean' }, { status: 400 })
  }

  const existingBrand = await prisma.brand.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      autoPilot: true,
    },
  })

  if (!existingBrand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  const nextAutoPilot =
    typeof requestedAutoPilot === 'boolean'
      ? requestedAutoPilot
      : requestedStatus && requestedStatus !== 'ACTIVE'
        ? false
        : undefined

  const updatedBrand = await prisma.$transaction(async (tx: any) => {
    const updated = await tx.brand.update({
      where: { id },
      data: {
        ...(requestedStatus !== undefined ? { status: requestedStatus } : {}),
        ...(nextAutoPilot !== undefined ? { autoPilot: nextAutoPilot } : {}),
      },
      select: {
        id: true,
        name: true,
        status: true,
        autoPilot: true,
        updatedAt: true,
      },
    })

    if (nextAutoPilot !== undefined) {
      await tx.socialAccount.updateMany({
        where: { brandId: id },
        data: { autoPilot: nextAutoPilot },
      })
    }

    await tx.auditLog.create({
      data: {
        actorId: auth.context.agent.id,
        actorType: 'AI_AGENT',
        actorName: auth.context.agent.email || auth.context.agent.id,
        action: 'agent_admin.brand.update',
        resourceId: id,
        resourceType: 'Brand',
        oldValue: {
          status: existingBrand.status,
          autoPilot: existingBrand.autoPilot,
        },
        newValue: {
          status: updated.status,
          autoPilot: updated.autoPilot,
        },
        reason,
        metadata: {
          authorizedAdminIds: auth.context.authorizedAdminIds,
        },
      },
    })

    return updated
  })

  if (nextAutoPilot !== undefined) {
    try {
      await refreshBrandProfileMarkdown(id)
    } catch {
      // non-fatal — admin update should not fail due to profile markdown refresh
    }
  }

  return NextResponse.json({ success: true, brand: updatedBrand })
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAdminAgent(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  let reason: string | null = null
  try {
    const body = await request.json()
    reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
  } catch {
    reason = null
  }

  const existingBrand = await prisma.brand.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      autoPilot: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          accounts: true,
          contents: true,
          assets: true,
          actionItems: true,
          conversions: true,
          gameSessions: true,
          brandAgents: true,
          owners: true,
        },
      },
    },
  })

  if (!existingBrand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  await prisma.$transaction(async (tx: any) => {
    await tx.brand.delete({ where: { id } })

    await tx.auditLog.create({
      data: {
        actorId: auth.context.agent.id,
        actorType: 'AI_AGENT',
        actorName: auth.context.agent.email || auth.context.agent.id,
        action: 'agent_admin.brand.delete',
        resourceId: existingBrand.id,
        resourceType: 'Brand',
        oldValue: existingBrand,
        newValue: Prisma.JsonNull,
        reason,
        metadata: {
          authorizedAdminIds: auth.context.authorizedAdminIds,
        },
      },
    })
  })

  return NextResponse.json({
    success: true,
    deleted: {
      id: existingBrand.id,
      name: existingBrand.name,
      status: existingBrand.status,
    },
  })
}