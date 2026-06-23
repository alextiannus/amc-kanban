import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureSystemConfig } from '@/lib/systemConfig'
import { isAmcOperator } from '@/lib/amcOperator'

function maskKey(key: string | null | undefined): string | null {
  if (!key) return null
  if (key.length <= 8) return '••••••••'
  return `••••••${key.slice(-4)}`
}

// GET /api/admin/system-config
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const config = await ensureSystemConfig()
  return NextResponse.json({
    id: config.id,
    geminiApiKey: maskKey(config.geminiApiKey),
    configured: !!config.geminiApiKey,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  })
}

// PATCH /api/admin/system-config
export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const actorId = typeof session.user.id === 'string' ? session.user.id : null
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const current = await ensureSystemConfig()
  let nextKey: string | null | undefined = undefined


  if ('geminiApiKey' in body) {
    const inputKey = body.geminiApiKey
    if (typeof inputKey === 'string' && inputKey.startsWith('••••••')) {
      // Masked placeholder sent, keep original value
      nextKey = current.geminiApiKey
    } else if (inputKey === '' || inputKey === null) {
      nextKey = null
    } else {
      nextKey = String(inputKey).trim()
    }
  }

  const updated = await prisma.systemConfig.update({
    where: { id: 'default' },
    data: {
      ...(nextKey !== undefined && { geminiApiKey: nextKey }),
    },
  })

  // Prevent credentials from leaking in the audit log
  const maskedOld = { ...current, geminiApiKey: maskKey(current.geminiApiKey) }
  const maskedNew = { ...updated, geminiApiKey: maskKey(updated.geminiApiKey) }

  await prisma.auditLog.create({
    data: {
      actorId,
      actorType: 'HUMAN',
      actorName: session.user.email || null,
      action: 'SYSTEM_CONFIG_UPDATED',
      resourceId: updated.id,
      resourceType: 'SystemConfig',
      oldValue: maskedOld,
      newValue: maskedNew,
    },
  })

  return NextResponse.json({
    id: updated.id,
    geminiApiKey: maskKey(updated.geminiApiKey),
    configured: !!updated.geminiApiKey,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  })
}
