import { NextResponse } from 'next/server'
import { extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const BRAND_ADMIN_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const

export type BrandAdminStatus = typeof BRAND_ADMIN_STATUSES[number]

type AdminAgentContext = {
  agent: {
    id: string
    email: string | null
    role: string | null
  }
  authorizedAdminIds: string[]
}

type AdminAgentAuthResult =
  | { ok: true; context: AdminAgentContext }
  | { ok: false; response: NextResponse }

export function isBrandAdminStatus(value: unknown): value is BrandAdminStatus {
  return typeof value === 'string' && BRAND_ADMIN_STATUSES.includes(value as BrandAdminStatus)
}

export async function requireAdminAgent(request: Request): Promise<AdminAgentAuthResult> {
  const apiKey = extractApiKey(request)
  if (!apiKey) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized: Bearer token required' }, { status: 401 }),
    }
  }

  const authenticatedAgent = await getAgentFromApiKey(apiKey)
  if (!authenticatedAgent || authenticatedAgent.type !== 'AI_AGENT') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized: AI Agent API key required' }, { status: 401 }),
    }
  }

  const adminPermissions = await prisma.agentPermission.findMany({
    where: { agentId: authenticatedAgent.id },
    include: {
      human: {
        select: {
          id: true,
          role: true,
        },
      },
    },
  })

  const authorizedAdminIds = adminPermissions.filter((permission) => permission.human.role === 'ADMIN').map((permission) => permission.human.id)

  if (authenticatedAgent.role !== 'ADMIN' && authorizedAdminIds.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden: admin-capable AI Agent required' }, { status: 403 }),
    }
  }

  return {
    ok: true,
    context: {
      agent: {
        id: authenticatedAgent.id,
        email: authenticatedAgent.email || null,
        role: authenticatedAgent.role || null,
      },
      authorizedAdminIds,
    },
  }
}