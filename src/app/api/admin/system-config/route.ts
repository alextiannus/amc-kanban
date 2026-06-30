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

function maskPassword(pw: string | null | undefined): string | null {
  if (!pw) return null
  return '••••••••'
}

function resolveField(body: Record<string, any>, field: string, current: string | null | undefined): string | null | undefined {
  if (!(field in body)) return undefined
  const val = body[field]
  if (typeof val === 'string' && val.startsWith('••••••')) return current ?? null  // masked placeholder
  if (val === '' || val === null) return null
  return String(val).trim()
}

function resolveIntField(body: Record<string, any>, field: string, current: number | null | undefined): number | null | undefined {
  if (!(field in body)) return undefined
  const val = body[field]
  if (val === '' || val === null) return null
  const n = parseInt(String(val), 10)
  return isNaN(n) ? (current ?? null) : n
}

function resolveBoolField(body: Record<string, any>, field: string, current: boolean | null | undefined): boolean | null | undefined {
  if (!(field in body)) return undefined
  const val = body[field]
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'boolean') return val
  return val === 'true' || val === true
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
    // SMTP
    smtpHost: config.smtpHost || '',
    smtpPort: config.smtpPort ?? null,
    smtpUser: config.smtpUser || '',
    smtpPassword: maskPassword(config.smtpPassword),
    smtpFrom: config.smtpFrom || '',
    smtpFromName: config.smtpFromName || '',
    smtpSecure: config.smtpSecure ?? true,
    smtpConfigured: !!(config.smtpHost && config.smtpFrom),
    // Direct Social integrations
    metaAppId: config.metaAppId || '',
    metaAppSecret: maskKey(config.metaAppSecret),
    metaAppSecretConfigured: !!config.metaAppSecret,
    metaRedirectUri: config.metaRedirectUri || '',
    googleClientId: config.googleClientId || '',
    googleClientSecret: maskKey(config.googleClientSecret),
    googleClientSecretConfigured: !!config.googleClientSecret,
    googleRedirectUri: config.googleRedirectUri || '',
    tiktokClientKey: config.tiktokClientKey || '',
    tiktokClientSecret: maskKey(config.tiktokClientSecret),
    tiktokClientSecretConfigured: !!config.tiktokClientSecret,
    tiktokRedirectUri: config.tiktokRedirectUri || '',
    useDirectPublishing: config.useDirectPublishing ?? false,
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
  // SMTP fields
  const nextSmtpHost      = resolveField(body, 'smtpHost', current.smtpHost)
  const nextSmtpPort      = resolveIntField(body, 'smtpPort', current.smtpPort)
  const nextSmtpUser      = resolveField(body, 'smtpUser', current.smtpUser)
  const nextSmtpPassword  = resolveField(body, 'smtpPassword', current.smtpPassword)
  const nextSmtpFrom      = resolveField(body, 'smtpFrom', current.smtpFrom)
  const nextSmtpFromName  = resolveField(body, 'smtpFromName', current.smtpFromName)
  const nextSmtpSecure    = resolveBoolField(body, 'smtpSecure', current.smtpSecure)
  // Direct Social integration fields
  const nextMetaAppId       = resolveField(body, 'metaAppId', current.metaAppId)
  const nextMetaAppSecret   = resolveField(body, 'metaAppSecret', current.metaAppSecret)
  const nextMetaRedirectUri = resolveField(body, 'metaRedirectUri', current.metaRedirectUri)
  const nextGoogleClientId       = resolveField(body, 'googleClientId', current.googleClientId)
  const nextGoogleClientSecret   = resolveField(body, 'googleClientSecret', current.googleClientSecret)
  const nextGoogleRedirectUri = resolveField(body, 'googleRedirectUri', current.googleRedirectUri)
  const nextTiktokClientKey       = resolveField(body, 'tiktokClientKey', current.tiktokClientKey)
  const nextTiktokClientSecret   = resolveField(body, 'tiktokClientSecret', current.tiktokClientSecret)
  const nextTiktokRedirectUri = resolveField(body, 'tiktokRedirectUri', current.tiktokRedirectUri)
  const nextUseDirectPublishing   = resolveBoolField(body, 'useDirectPublishing', current.useDirectPublishing)

  const updated = await prisma.systemConfig.update({
    where: { id: 'default' },
    data: {
      ...(nextGeminiKey    !== undefined && { geminiApiKey: nextGeminiKey }),
      ...(nextAzureKey     !== undefined && { azureSpeechKey: nextAzureKey }),
      ...(nextAzureRegion  !== undefined && { azureSpeechRegion: nextAzureRegion }),
      ...(nextSmtpHost     !== undefined && { smtpHost: nextSmtpHost }),
      ...(nextSmtpPort     !== undefined && { smtpPort: nextSmtpPort }),
      ...(nextSmtpUser     !== undefined && { smtpUser: nextSmtpUser }),
      ...(nextSmtpPassword !== undefined && { smtpPassword: nextSmtpPassword }),
      ...(nextSmtpFrom     !== undefined && { smtpFrom: nextSmtpFrom }),
      ...(nextSmtpFromName !== undefined && { smtpFromName: nextSmtpFromName }),
      ...(nextSmtpSecure   !== undefined && { smtpSecure: nextSmtpSecure }),
      ...(nextMetaAppId       !== undefined && { metaAppId: nextMetaAppId }),
      ...(nextMetaAppSecret   !== undefined && { metaAppSecret: nextMetaAppSecret }),
      ...(nextMetaRedirectUri !== undefined && { metaRedirectUri: nextMetaRedirectUri }),
      ...(nextGoogleClientId       !== undefined && { googleClientId: nextGoogleClientId }),
      ...(nextGoogleClientSecret   !== undefined && { googleClientSecret: nextGoogleClientSecret }),
      ...(nextGoogleRedirectUri !== undefined && { googleRedirectUri: nextGoogleRedirectUri }),
      ...(nextTiktokClientKey       !== undefined && { tiktokClientKey: nextTiktokClientKey }),
      ...(nextTiktokClientSecret   !== undefined && { tiktokClientSecret: nextTiktokClientSecret }),
      ...(nextTiktokRedirectUri !== undefined && { tiktokRedirectUri: nextTiktokRedirectUri }),
      ...(nextUseDirectPublishing   !== undefined && { useDirectPublishing: nextUseDirectPublishing }),
    },
  })

  // Mask credentials in audit log
  const maskedOld = {
    ...current,
    geminiApiKey: maskKey(current.geminiApiKey),
    azureSpeechKey: maskKey(current.azureSpeechKey),
    smtpPassword: maskPassword(current.smtpPassword),
    metaAppSecret: maskKey(current.metaAppSecret),
    googleClientSecret: maskKey(current.googleClientSecret),
    tiktokClientSecret: maskKey(current.tiktokClientSecret),
  }
  const maskedNew = {
    ...updated,
    geminiApiKey: maskKey(updated.geminiApiKey),
    azureSpeechKey: maskKey(updated.azureSpeechKey),
    smtpPassword: maskPassword(updated.smtpPassword),
    metaAppSecret: maskKey(updated.metaAppSecret),
    googleClientSecret: maskKey(updated.googleClientSecret),
    tiktokClientSecret: maskKey(updated.tiktokClientSecret),
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
    smtpHost: updated.smtpHost || '',
    smtpPort: updated.smtpPort ?? null,
    smtpUser: updated.smtpUser || '',
    smtpPassword: maskPassword(updated.smtpPassword),
    smtpFrom: updated.smtpFrom || '',
    smtpFromName: updated.smtpFromName || '',
    smtpSecure: updated.smtpSecure ?? true,
    smtpConfigured: !!(updated.smtpHost && updated.smtpFrom),
    // Direct Social integrations
    metaAppId: updated.metaAppId || '',
    metaAppSecret: maskKey(updated.metaAppSecret),
    metaAppSecretConfigured: !!updated.metaAppSecret,
    metaRedirectUri: updated.metaRedirectUri || '',
    googleClientId: updated.googleClientId || '',
    googleClientSecret: maskKey(updated.googleClientSecret),
    googleClientSecretConfigured: !!updated.googleClientSecret,
    googleRedirectUri: updated.googleRedirectUri || '',
    tiktokClientKey: updated.tiktokClientKey || '',
    tiktokClientSecret: maskKey(updated.tiktokClientSecret),
    tiktokClientSecretConfigured: !!updated.tiktokClientSecret,
    tiktokRedirectUri: updated.tiktokRedirectUri || '',
    useDirectPublishing: updated.useDirectPublishing ?? false,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  })
}
