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

function resolveField(body: Record<string, any>, field: string, current: string | null): string | null | undefined {
  if (!(field in body)) return undefined
  const val = body[field]
  if (typeof val === 'string' && val.startsWith('••••••')) return current  // masked placeholder
  if (val === '' || val === null) return null
  return String(val).trim()
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
    geminiConfigured: !!config.geminiApiKey,
    azureSpeechKey: maskKey(config.azureSpeechKey),
    azureSpeechRegion: config.azureSpeechRegion || '',
    azureSpeechConfigured: !!config.azureSpeechKey,
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

  const nextGeminiKey     = resolveField(body, 'geminiApiKey', current.geminiApiKey)
  const nextAzureKey      = resolveField(body, 'azureSpeechKey', current.azureSpeechKey)
  const nextAzureRegion   = resolveField(body, 'azureSpeechRegion', current.azureSpeechRegion)

  const updated = await prisma.systemConfig.update({
    where: { id: 'default' },
    data: {
      ...(nextGeminiKey   !== undefined && { geminiApiKey: nextGeminiKey }),
      ...(nextAzureKey    !== undefined && { azureSpeechKey: nextAzureKey }),
      ...(nextAzureRegion !== undefined && { azureSpeechRegion: nextAzureRegion }),
    },
  })

  // Prevent credentials from leaking in the audit log
  const maskedOld = {
    ...current,
    geminiApiKey: maskKey(current.geminiApiKey),
    azureSpeechKey: maskKey(current.azureSpeechKey),
  }
  const maskedNew = {
    ...updated,
    geminiApiKey: maskKey(updated.geminiApiKey),
    azureSpeechKey: maskKey(updated.azureSpeechKey),
  }

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
    geminiConfigured: !!updated.geminiApiKey,
    azureSpeechKey: maskKey(updated.azureSpeechKey),
    azureSpeechRegion: updated.azureSpeechRegion || '',
    azureSpeechConfigured: !!updated.azureSpeechKey,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  })
}
