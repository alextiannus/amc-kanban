import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canOwnBrand } from '@/lib/brandAccess'
import { postfastFetchAccounts } from '@/lib/integrations/postfast'
import { refreshBrandProfileMarkdown } from '@/lib/brandProfileMarkdown'

type Params = { params: Promise<{ id: string }> }

const GOOGLE_PLATFORM_ALIASES = [
  'google',
  'google_business_profile',
  'googlebusinessprofile',
  'google_my_business',
  'googlemybusiness',
  'google_maps',
  'googlemaps',
  'gbp',
  'gmb',
]

function maskKey(key: string | null) {
  if (!key) return null
  return `••••••${key.slice(-4)}`
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

  // Helper: only update if key present in body; empty string = clear
  const opt = (val: unknown) => {
    if (val === undefined) return undefined
    return val === '' ? null : (val as string)
  }

  const updated = await prisma.brand.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.location !== undefined && { location: opt(body.location) }),
      ...(body.timezone !== undefined && { timezone: body.timezone }),
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
      ...(body.googlePreferOAuth !== undefined && { googlePreferOAuth: body.googlePreferOAuth }),

    },
  })



  // Auto-sync PostFast accounts when API key is present
  // Trigger: a postfastApiKey was just set, or the brand already has one
  let postfastSync: { synced: number; accounts: string[] } | undefined
  const activeKey = updated.postfastApiKey
  if (activeKey && (body.postfastApiKey !== undefined || body.postfastApiKey === undefined)) {
    try {
      const pfResult = await postfastFetchAccounts(activeKey)
      if (pfResult.success && pfResult.accounts.length > 0) {
        // Upsert each PostFast account into SocialAccount table
        const syncResults = { success: 0, failed: 0, errors: [] as string[] }
        for (const acc of pfResult.accounts) {
          try {
            // Validate required fields
            if (!acc.platformId || !acc.handle) {
              syncResults.failed++
              const reason = `missing ${!acc.platformId ? 'platformId' : 'handle'}`
              syncResults.errors.push(`${acc.platform}:${acc.id} - ${reason}`)
              console.warn(`[Settings] Skipping account ${acc.platform}:${acc.id} - ${reason}`)
              continue
            }
            
            if (acc.platformId === 'google') {
              const existingGoogle = await prisma.socialAccount.findFirst({
                where: { brandId: id, platformId: { in: GOOGLE_PLATFORM_ALIASES } },
                orderBy: { updatedAt: 'desc' },
                select: { id: true },
              })

              if (existingGoogle) {
                await prisma.socialAccount.update({
                  where: { id: existingGoogle.id },
                  data: {
                    platformId: 'google',
                    handle: acc.handle,
                    displayName: acc.displayName ?? acc.handle,
                    profileUrl: acc.profileUrl ?? null,
                    followerCount: acc.followerCount ?? null,
                    followerDelta: acc.followerDelta ?? 0,
                    ratingScore: acc.ratingScore ?? null,
                    snapshotAt: new Date(),
                  },
                })
              } else {
                await prisma.socialAccount.create({
                  data: {
                    brandId: id,
                    platformId: 'google',
                    handle: acc.handle,
                    displayName: acc.displayName ?? acc.handle,
                    profileUrl: acc.profileUrl ?? null,
                    followerCount: acc.followerCount ?? null,
                    followerDelta: acc.followerDelta ?? 0,
                    ratingScore: acc.ratingScore ?? null,
                    snapshotAt: new Date(),
                  },
                })
              }
            } else {
                if (acc.profileUrl) {
                  const existingByProfile = await prisma.socialAccount.findFirst({
                    where: { brandId: id, platformId: acc.platformId, profileUrl: acc.profileUrl },
                    select: { id: true },
                  })
                  if (existingByProfile) {
                    await prisma.socialAccount.update({
                      where: { id: existingByProfile.id },
                      data: {
                        handle: acc.handle,
                        displayName: acc.displayName ?? acc.handle,
                        followerCount: acc.followerCount ?? null,
                        followerDelta: acc.followerDelta ?? 0,
                        ratingScore: acc.ratingScore ?? null,
                        snapshotAt: new Date(),
                      },
                    })
                    syncResults.success++
                    console.log(`[Settings] ✓ Synced ${acc.platformId}:${acc.handle}`)
                    continue
                  }
                }

              await prisma.socialAccount.upsert({
                where: { brandId_platformId_handle: { brandId: id, platformId: acc.platformId, handle: acc.handle } },
                create: {
                  brandId: id,
                  platformId: acc.platformId,
                  handle: acc.handle,
                  displayName: acc.displayName ?? acc.handle,
                  profileUrl: acc.profileUrl ?? null,
                  followerCount: acc.followerCount ?? null,
                  followerDelta: acc.followerDelta ?? 0,
                  ratingScore: acc.ratingScore ?? null,
                  snapshotAt: new Date(),
                },
                update: {
                  displayName: acc.displayName ?? acc.handle,
                  profileUrl: acc.profileUrl ?? null,
                  followerCount: acc.followerCount ?? null,
                  followerDelta: acc.followerDelta ?? 0,
                  ratingScore: acc.ratingScore ?? null,
                  snapshotAt: new Date(),
                },
              })
            }
            syncResults.success++
            console.log(`[Settings] ✓ Synced ${acc.platformId}:${acc.handle}`)
          } catch (e: unknown) {
            syncResults.failed++
            const message = e instanceof Error ? e.message : String(e)
            const errMsg = message.split('\n')[0] ?? message
            syncResults.errors.push(`${acc.platformId}:${acc.handle} - ${errMsg}`)
            console.error(`[Settings] ✗ Failed to sync ${acc.platformId}:${acc.handle}:`, errMsg)
          }
        }

        // Prune stale accounts: delete any account that is not in the PostFast synced accounts list,
        // unless it's a direct Google Business Profile account.
        try {
          const postfastPlatformHandles = pfResult.accounts.map((acc: any) => ({
            platformId: acc.platformId,
            handle: acc.handle
          }))

          const dbAccounts = await prisma.socialAccount.findMany({
            where: { brandId: id },
            select: { id: true, platformId: true, handle: true }
          })

          const brandInfo = await prisma.brand.findUnique({
            where: { id },
            select: { googlePreferOAuth: true, googleRefreshToken: true, googleLocationId: true }
          })

          const isDirectGoogleConfigured = brandInfo?.googlePreferOAuth && brandInfo?.googleRefreshToken && brandInfo?.googleLocationId

          const accountsToDelete = dbAccounts.filter((dbAcc: any) => {
            if (dbAcc.platformId === 'google' && isDirectGoogleConfigured) {
              return false
            }
            const isMatched = postfastPlatformHandles.some((pfAcc: any) => 
              pfAcc.platformId.toLowerCase() === dbAcc.platformId.toLowerCase() &&
              pfAcc.handle.toLowerCase() === dbAcc.handle.toLowerCase()
            )
            return !isMatched
          })

          if (accountsToDelete.length > 0) {
            const idsToDelete = accountsToDelete.map((a: any) => a.id)
            await prisma.socialAccount.deleteMany({
              where: { id: { in: idsToDelete } }
            })
            console.log(`[Settings Sync] Deleted ${accountsToDelete.length} stale social accounts for brand ${id}`)
          }
        } catch (pruneErr) {
          console.warn('[Settings] Failed to prune stale social accounts:', pruneErr)
        }

        postfastSync = {
          synced: syncResults.success,
          accounts: pfResult.accounts.map((a: any) => `${a.platformId}:${a.handle}`),
        }
        console.log(`[Settings] PostFast sync complete: ${syncResults.success}/${pfResult.accounts.length} accounts synced for brand ${id}` + (syncResults.errors.length > 0 ? ` (${syncResults.failed} failed: ${syncResults.errors.join('; ')})` : ''))
      } else if (!pfResult.success) {
        console.warn(`[Settings] PostFast account fetch failed: ${pfResult.error}`)
      }
    } catch (e) {
      console.warn('[Settings] PostFast sync failed (non-fatal):', e)
    }
  }

  try {
    await refreshBrandProfileMarkdown(id)
  } catch {
    // non-fatal — settings save should not fail because profile file refresh fails
  }

  return NextResponse.json({
    ok: true,
    postfastConfigured: !!updated.postfastApiKey,
    postfastSync,
    googleConfigured: !!(updated.googleRefreshToken || (updated.googlePlaceId && updated.googleApiKey)),
    googlePreferOAuth: updated.googlePreferOAuth,
  })
}
