import { prisma } from './prisma'

type Actor = {
  id?: string | null
  type?: string | null
  name?: string | null
}

type AuditInput = {
  actor?: Actor | null
  action: string
  resourceId: string
  resourceType?: string
  oldValue?: unknown
  newValue?: unknown
  reason?: string | null
  metadata?: unknown
}

function safeJson(value: unknown) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

export async function writeAuditLog(input: AuditInput) {
  try {
    await (prisma as any).auditLog.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorType: input.actor?.type ?? 'SYSTEM',
        actorName: input.actor?.name ?? null,
        action: input.action,
        resourceId: input.resourceId,
        resourceType: input.resourceType ?? 'WorkUnit',
        oldValue: safeJson(input.oldValue),
        newValue: safeJson(input.newValue),
        reason: input.reason ?? null,
        metadata: safeJson(input.metadata),
      }
    })
  } catch (error) {
    // Audit logging must not break the primary workflow. Keep a server-side trace for diagnosis.
    console.error('Audit log write failed:', error)
  }
}

export function actorFromContext(sessionUser?: any, agent?: any): Actor {
  if (agent) {
    return {
      id: agent.id,
      type: 'AI_AGENT',
      name: agent.email,
    }
  }

  if (sessionUser) {
    return {
      id: sessionUser.id,
      type: 'HUMAN',
      name: sessionUser.email,
    }
  }

  return { type: 'SYSTEM', name: 'system' }
}
