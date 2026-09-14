import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureSystemConfig } from '@/lib/systemConfig'
import { analysisGateway } from '@/lib/asset-analysis/gateway'
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
    assetAnalysisEnabled: config.assetAnalysisEnabled,
    assetAnalysisGatewayUrl: config.assetAnalysisGatewayUrl || '',
    assetAnalysisGatewaySecret: maskPassword(config.assetAnalysisGatewaySecret),
    // Note: geminiApiKey and minimaxApiKey are retained in the DB schema but
    // are no longer managed here. AI keys are now in Admin → AI 模型配置 (LLMConfig).
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
    // Immedi ERP integration
    immediErpEnabled: config.immediErpEnabled ?? false,
    immediErpApiKey: maskKey(config.immediErpApiKey),
    immediErpApiKeyConfigured: !!config.immediErpApiKey,
    immediErpBaseUrl: config.immediErpBaseUrl || 'https://today.immedi.ai/external/v1',
    immediErpItemCodeMap: config.immediErpItemCodeMap ?? null,
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

  const analysisUrl = resolveField(body, 'assetAnalysisGatewayUrl', current.assetAnalysisGatewayUrl)
  const analysisSecret = resolveField(body, 'assetAnalysisGatewaySecret', current.assetAnalysisGatewaySecret)
  if ('assetAnalysisEnabled' in body && typeof body.assetAnalysisEnabled !== 'boolean') return NextResponse.json({ error: 'Invalid analysis enabled flag' }, { status: 400 })
  const analysisEnabled = body.assetAnalysisEnabled ?? current.assetAnalysisEnabled
  if (analysisUrl) {
    try { const url = new URL(analysisUrl); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error() } catch { return NextResponse.json({ error: 'Image analysis gateway must be an HTTPS URL without credentials or query' }, { status: 400 }) }
  }
  if (analysisEnabled && ['assetAnalysisEnabled', 'assetAnalysisGatewayUrl', 'assetAnalysisGatewaySecret'].some(k => k in body)) {
    const baseUrl = (analysisUrl === undefined ? current.assetAnalysisGatewayUrl : analysisUrl) || ''
    const secret = (analysisSecret === undefined ? current.assetAnalysisGatewaySecret : analysisSecret) || ''
    if (!baseUrl || !secret) return NextResponse.json({ error: 'Gateway URL and secret are required' }, { status: 400 })
    try {
      const capabilities = await analysisGateway({ baseUrl: baseUrl.replace(/\/+$/, ''), secret }, '/v1/capabilities')
      if (!['asset_image_analysis', 'asset_category_summary'].every(task => capabilities.tasks?.some((entry: any) => entry.task === task && entry.configured && entry.models?.includes('doubao-seed-2.1-turbo')))) throw new Error('Publish image analysis capabilities to the gateway first')
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 422 }) }
  }

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
  // Immedi ERP
  const nextImmediErpEnabled  = resolveBoolField(body, 'immediErpEnabled', current.immediErpEnabled)
  const nextImmediErpApiKey   = resolveField(body, 'immediErpApiKey', current.immediErpApiKey)
  const nextImmediErpBaseUrl  = resolveField(body, 'immediErpBaseUrl', current.immediErpBaseUrl)
  const nextImmediErpItemCodeMap = 'immediErpItemCodeMap' in body ? body.immediErpItemCodeMap : undefined

  const updated = await prisma.systemConfig.update({
    where: { id: 'default' },
    data: {
      ...(analysisUrl !== undefined && { assetAnalysisGatewayUrl: analysisUrl }),
      ...(analysisSecret !== undefined && { assetAnalysisGatewaySecret: analysisSecret }),
      ...('assetAnalysisEnabled' in body && { assetAnalysisEnabled: analysisEnabled }),
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
      ...(nextImmediErpEnabled  !== undefined && { immediErpEnabled:  nextImmediErpEnabled  }),
      ...(nextImmediErpApiKey   !== undefined && { immediErpApiKey:   nextImmediErpApiKey   }),
      ...(nextImmediErpBaseUrl  !== undefined && { immediErpBaseUrl:  nextImmediErpBaseUrl  }),
      ...(nextImmediErpItemCodeMap !== undefined && { immediErpItemCodeMap: nextImmediErpItemCodeMap }),
    },
  })

  // Mask credentials in audit log
  const maskedOld = {
    ...current,
    assetAnalysisGatewaySecret: maskPassword(current.assetAnalysisGatewaySecret),
    smtpPassword: maskPassword(current.smtpPassword),
    metaAppSecret: maskKey(current.metaAppSecret),
    googleClientSecret: maskKey(current.googleClientSecret),
    tiktokClientSecret: maskKey(current.tiktokClientSecret),
  }
  const maskedNew = {
    ...updated,
    assetAnalysisGatewaySecret: maskPassword(updated.assetAnalysisGatewaySecret),
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
    assetAnalysisEnabled: updated.assetAnalysisEnabled,
    assetAnalysisGatewayUrl: updated.assetAnalysisGatewayUrl || '',
    assetAnalysisGatewaySecret: maskPassword(updated.assetAnalysisGatewaySecret),
    // Note: geminiApiKey/minimaxApiKey remain in DB but are no longer managed here.
    // SMTP
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
    // Immedi ERP
    immediErpEnabled: updated.immediErpEnabled ?? false,
    immediErpApiKey: maskKey(updated.immediErpApiKey),
    immediErpApiKeyConfigured: !!updated.immediErpApiKey,
    immediErpBaseUrl: updated.immediErpBaseUrl || 'https://today.immedi.ai/external/v1',
    immediErpItemCodeMap: updated.immediErpItemCodeMap ?? null,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  })
}
