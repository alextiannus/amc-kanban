import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { BRAND_ADMIN_STATUSES, isBrandAdminStatus, requireAdminAgent } from '@/lib/agentAdmin'

export async function GET(request: Request) {
  const auth = await requireAdminAgent(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const search = url.searchParams.get('search')?.trim() || ''
  const rawStatus = url.searchParams.get('status')?.trim().toUpperCase() || ''

  if (rawStatus && !isBrandAdminStatus(rawStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Allowed values: ${BRAND_ADMIN_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const brands = await prisma.brand.findMany({
    where: {
      ...(rawStatus ? { status: rawStatus } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { location: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      location: true,
      timezone: true,
      autoPilot: true,
      status: true,
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
        where: { active: true },
        select: {
          id: true,
          role: true,
          agent: {
            select: {
              id: true,
              email: true,
              nickname: true,
            },
          },
        },
      },
      _count: {
        select: {
          accounts: true,
          contents: true,
          assets: true,
          actionItems: true,
          brandAgents: true,
          owners: true,
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({
    brands,
    allowedStatuses: BRAND_ADMIN_STATUSES,
    adminAgent: auth.context.agent,
  })
}