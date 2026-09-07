import { syncSocialAccountBindings } from '@/lib/socialAccountBinding'
import { after, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canOwnBrand } from '@/lib/brandAccess'
import { postfastFetchAccounts } from '@/lib/integrations/postfast'
import { refreshBrandProfileMarkdown } from '@/lib/brandProfileMarkdown'
import { assertValidTimeZone } from '@/lib/gameActivityRounds'
import { requestGameShareDraftPoolRefill } from '@/lib/gameShareDraftPool'
import { growthPathsForBrandPatch, queueBrandGrowthSync, syncBrandGrowthState } from '@/lib/brandGrowthSync'

export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

function maskKey(key: string | null) {
  if (!key) return null
  return `••••••${key.slice(-4)}`
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}
}

function appReviewUrlFromMeta(value: unknown) {
  const appReviewUrl = jsonObject(value).appReviewUrl
  return typeof appReviewUrl === 'string' ? appReviewUrl : null
}

// GET /api/brands/[id]/settings
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!(await canOwnBrand(id, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const brand = await prisma.brand.findUnique({ where: { id } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: brand.id,
    name: brand.name,
    location: brand.location,
    timezone: brand.timezone,
    autoPilot: brand.autoPilot,

    // Brand profile
    description: brand.description,
    website: brand.website,
    phone: brand.phone,
    address: brand.address,

    // PostFast
    postfastApiKey: maskKey(brand.postfastApiKey),
    postfastConfigured: !!brand.postfastApiKey,
    postfastConnectLink: brand.postfastConnectLink,

    // Google Business
    googlePlaceId: brand.googlePlaceId,
    googleApiKey: maskKey(brand.googleApiKey),
    googleClientId: brand.googleClientId,
    googleClientSecret: maskKey(brand.googleClientSecret),
    googleRedirectUri: brand.googleRedirectUri,
    googleRefreshTokenConfigured: !!brand.googleRefreshToken,
    googleLocationName: brand.googleLocationName,
    googleLocationId: brand.googleLocationId,
    googleBusinessUrl: brand.googleBusinessUrl,
    googleReviewUrl: brand.googleReviewUrl,
    googleReviewAppUrl: appReviewUrlFromMeta(brand.googleLinksMeta),
    googleLinksMeta: brand.googleLinksMeta,
    googlePreferOAuth: brand.googlePreferOAuth,
    googleConfigured: !!(brand.googleRefreshToken || (brand.googlePlaceId && brand.googleApiKey)),


  })
}

// PATCH /api/brands/[id]/settings
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!(await canOwnBrand(id, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const brand = await prisma.brand.findUnique({ where: { id } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  if (body.timezone !== undefined) {
    try {
      assertValidTimeZone(body.timezone)
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid timezone' }, { status: 400 })
    }
  }
  const normalizedTimezone = body.timezone === undefined ? undefined : body.timezone.trim()

  // Helper: only update if key present in body; empty string = clear
  const opt = (val: unknown) => {
    if (val === undefined) return undefined
    return val === '' ? null : (val as string)
  }

  const nextGoogleLinksMeta = body.googleReviewAppUrl !== undefined
    ? (() => {
        const value = jsonObject(brand.googleLinksMeta)
        const appReviewUrl = opt(body.googleReviewAppUrl)
        if (appReviewUrl) value.appReviewUrl = appReviewUrl
        else delete value.appReviewUrl
        return value as Prisma.InputJsonObject
      })()
    : undefined

  const growthProfileKeys = ['name', 'location', 'timezone', 'description', 'website', 'phone', 'address', 'googlePlaceId']
  const hasGrowthChanges = growthProfileKeys.some(key => body[key] !== undefined)
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const saved = await tx.brand.update({
      where: { id },
      data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.location !== undefined && { location: opt(body.location) }),
      ...(normalizedTimezone !== undefined && { timezone: normalizedTimezone }),
      // Brand profile
      ...(body.description !== undefined && { description: opt(body.description) }),
      ...(body.website !== undefined && { website: opt(body.website) }),
      ...(body.phone !== undefined && { phone: opt(body.phone) }),
      ...(body.address !== undefined && { address: opt(body.address) }),
      // PostFast
      ...(body.postfastApiKey !== undefined && { postfastApiKey: opt(body.postfastApiKey) }),
      // Google Business
      ...(body.googlePlaceId !== undefined && { googlePlaceId: opt(body.googlePlaceId) }),
      ...(body.googleApiKey !== undefined && { googleApiKey: opt(body.googleApiKey) }),
      ...(body.googleClientId !== undefined && { googleClientId: opt(body.googleClientId) }),
      ...(body.googleClientSecret !== undefined && { googleClientSecret: opt(body.googleClientSecret) }),
      ...(body.googleRedirectUri !== undefined && { googleRedirectUri: opt(body.googleRedirectUri) }),
      ...(body.googleBusinessUrl !== undefined && { googleBusinessUrl: opt(body.googleBusinessUrl) }),
      ...(body.googleReviewUrl !== undefined && { googleReviewUrl: opt(body.googleReviewUrl) }),
      ...(nextGoogleLinksMeta !== undefined && { googleLinksMeta: nextGoogleLinksMeta }),
      ...(body.googlePreferOAuth !== undefined && { googlePreferOAuth: body.googlePreferOAuth }),
      },
    })
    if (hasGrowthChanges) {
      await queueBrandGrowthSync({
        brandId: id,
        dirtyPaths: growthPathsForBrandPatch(body),
        actor: {
          id: session.user.id,
          email: session.user.email,
          type: session.user.type,
          roles: session.user.role ? [session.user.role] : [],
        },
        tx,
      })
    }
    return saved
  })



  // Auto-sync PostFast accounts when API key is present
  // Trigger: a postfastApiKey was just set, or the brand already has one
  let postfastSync: { synced: number; accounts: string[]; error?: string } | undefined
  const activeKey = updated.postfastApiKey
  if (activeKey) {
    try {
      const pfResult = await postfastFetchAccounts(activeKey)
      if (!pfResult.success) throw new Error(pfResult.error || 'PostFast account sync failed')
      if (pfResult.success) {
        const accounts = await syncSocialAccountBindings(id, pfResult.accounts)
        postfastSync = { synced: accounts.length, accounts: accounts.map((account: any) => `${account.platformId}:${account.handle}`) }
      } else if (!pfResult.success) {
        console.warn(`[Settings] PostFast account fetch failed: ${pfResult.error}`)
      }
    } catch (e) {
      postfastSync = { synced: 0, accounts: [], error: e instanceof Error ? e.message : 'PostFast account sync failed' }
      console.warn('[Settings] PostFast sync failed (non-fatal):', e)
    }
  }

  try {
    await refreshBrandProfileMarkdown(id)
  } catch {
    // non-fatal — settings save should not fail because profile file refresh fails
  }

  if (body.name !== undefined || body.location !== undefined || body.description !== undefined) {
    after(async () => {
      const gameConfig = await prisma.gameConfig.findUnique({ where: { brandId: id }, select: { id: true } })
      if (gameConfig) await requestGameShareDraftPoolRefill(gameConfig.id)
    })
  }
  if (hasGrowthChanges) {
    after(() => syncBrandGrowthState(id).then(() => undefined))
  }

  return NextResponse.json({
    ok: true,
    postfastConfigured: !!updated.postfastApiKey,
    postfastSync,
    googleConfigured: !!(updated.googleRefreshToken || (updated.googlePlaceId && updated.googleApiKey)),
    googlePreferOAuth: updated.googlePreferOAuth,
  })
}
