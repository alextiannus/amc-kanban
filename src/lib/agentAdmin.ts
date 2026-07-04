import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth-v2'

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
  const principal = await authenticateRequest(request)
  if (!principal) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized: Bearer token required' }, { status: 401 }),
    }
  }

  if (principal.actorType !== 'AMC_AGENT') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized: AI Agent API key required' }, { status: 401 }),
    }
  }

  if (!principal.globalRoles.includes('ADMIN')) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden: admin-capable AI Agent required' }, { status: 403 }),
    }
  }

  return {
    ok: true,
    context: {
      agent: {
        id: principal.userId,
        email: principal.email || null,
        role: 'ADMIN',
      },
      authorizedAdminIds: [principal.userId],
    },
  }
}
