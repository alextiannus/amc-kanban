import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

import { postfastFetchAccounts } from '@/lib/integrations/postfast'
import { extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { refreshBrandProfileMarkdown } from '@/lib/brandProfileMarkdown'
import { canAgentAccessBrand } from '@/lib/brandAccess'
import { createMarketingCrew, addCrewMember } from '@/lib/user-management/crew'
import { ensureBrandWorkspace } from '@/lib/brandWorkspace'

type BrandWithCredentials = {
  postfastApiKey: string | null
  googleApiKey: string | null
  larkAppId: string | null
  larkAppSecret: string | null
  larkBotWebhook: string | null
  googlePlaceId: string | null
  larkOwnerId: string | null
}

function toPublicBrand<T extends BrandWithCredentials>(brand: T) {
  const {
    postfastApiKey,
    googleApiKey,
    larkAppId,
    larkAppSecret,
    larkBotWebhook,
    ...publicBrand
  } = brand

  return {
    ...publicBrand,
    postfastConfigured: !!postfastApiKey,
    googleConfigured: !!brand.googlePlaceId && !!googleApiKey,
    larkConfigured: !!larkAppId && !!larkAppSecret,
    larkNotifyConfigured: !!brand.larkOwnerId || !!larkBotWebhook,
  }
}

async function getAgent(request: Request) {
  const apiKey = extractApiKey(request)
  if (!apiKey) return null
  return getAgentFromApiKey(apiKey)
}

// GET /api/agent/brand-config?brandId=<id>
// Agent fetches brand config including credentials for publishing
export async function GET(request: Request) {
  const agent = await getAgent(request)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')

  // No brandId → return all brands this agent is linked to
  if (!brandId) {
    const links = await prisma.brandAgent.findMany({
      where: {
        agentId: agent.id,
        active: true,
        brand: {
          status: { not: 'ARCHIVED' },
          subscriptions: {
            some: {
              status: 'ACTIVE',
              OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }],
            },
          },
        },
      },
      include: {
        brand: {
          select: {
            id: true, name: true, description: true, location: true, timezone: true,
            autoPilot: true,
            googlePlaceId: true,
            googleAccountId: true, googleLocationId: true, googleLocationName: true,
            larkDriveToken: true, larkDriveFolderId: true,
            larkOwnerId: true,
            postfastApiKey: true, googleApiKey: true,
            larkAppId: true, larkAppSecret: true, larkBotWebhook: true,
            accounts: { select: { id: true, platformId: true, handle: true, autoPilot: true } },
          },
        },
      },
    })
    const safeBrands = links.map((l: any) => toPublicBrand(l.brand))
    return NextResponse.json(safeBrands)
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true, name: true, description: true, logoUrl: true,
      website: true, phone: true, address: true, location: true,
      timezone: true, autoPilot: true,
      googlePlaceId: true,
      googleAccountId: true, googleLocationId: true, googleLocationName: true,
      larkDriveToken: true,
      larkDriveFolderId: true, larkOwnerId: true,
      postfastApiKey: true, googleApiKey: true,
      larkAppId: true, larkAppSecret: true, larkBotWebhook: true,
      accounts: { select: { id: true, platformId: true, handle: true, autoPilot: true } },
    },
  })

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (!(await canAgentAccessBrand(brandId, agent.id))) {
    return NextResponse.json({ error: 'Brand not linked to this agent' }, { status: 403 })
  }

  return NextResponse.json(toPublicBrand(brand))
}

// POST /api/agent/brand-config
// Agent creates a new brand autonomously.
// Owners = all HUMAN users who have this agent in their AgentPermission table.
// If no humans are linked, falls back to the first ADMIN user.
//
// Body: { name, location?, timezone?, address?, googlePlaceId? }
export async function POST(request: Request) {
  const agent = await getAgent(request)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, location, timezone, address, googlePlaceId } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Find owners linked to this agent in AgentPermission
  const permissions = await prisma.agentPermission.findMany({
    where: { agentId: agent.id },
    select: { userId: true },
  })

  let ownerId = permissions[0]?.userId
  if (!ownerId) {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    })
    if (!admin) return NextResponse.json({ error: 'No admin user found to assign brand' }, { status: 500 })
    ownerId = admin.id
  }

  const brand = await prisma.$transaction(async (tx: any) => {
    const b = await tx.brand.create({
      data: {
        ownerId,
        name: name.trim(),
        location: location?.trim() || null,
        timezone: timezone || 'America/New_York',
        ...(address ? { address: address.trim() } : {}),
        ...(googlePlaceId ? { googlePlaceId } : {}),
      },
    })

    const crew = await createMarketingCrew(b.id, tx)
    await addCrewMember(crew.id, ownerId, tx)

    await tx.brandOwner.upsert({
      where: { brandId_userId: { brandId: b.id, userId: ownerId } },
      create: { brandId: b.id, userId: ownerId },
      update: {},
    })

    await tx.userBusinessRole.upsert({
      where: { userId_role: { userId: ownerId, role: 'BRAND_OWNER' } },
      create: { userId: ownerId, role: 'BRAND_OWNER' },
      update: {},
    })

    // Also link the agent to this brand!
    await tx.brandAgent.upsert({
      where: { brandId_agentId: { brandId: b.id, agentId: agent.id } },
      create: { brandId: b.id, agentId: agent.id, active: true },
      update: { active: true },
    })

    return b
  })

  try {
    await ensureBrandWorkspace(brand.id)
  } catch (workspaceError) {
    console.error('[POST /api/agent/brand-config] workspace init failed:', workspaceError)
  }

  const brandWithRelations = await prisma.brand.findUnique({
    where: { id: brand.id },
    include: {
      accounts: { select: { id: true, platformId: true, handle: true, autoPilot: true } },
    },
  })

  if (!brandWithRelations) {
    return NextResponse.json({ error: 'Failed to retrieve created brand relations' }, { status: 500 })
  }

  const brandResBody = {
    ...brandWithRelations,
    postfastApiKey: brandWithRelations.postfastApiKey || null,
    googleApiKey: brandWithRelations.googleApiKey || null,
    larkAppId: brandWithRelations.larkAppId || null,
    larkAppSecret: brandWithRelations.larkAppSecret || null,
    larkBotWebhook: brandWithRelations.larkBotWebhook || null,
    googlePlaceId: brandWithRelations.googlePlaceId || null,
    larkOwnerId: brandWithRelations.larkOwnerId || null,
  }

  return NextResponse.json(toPublicBrand(brandResBody), { status: 201 })
}



// PATCH /api/agent/brand-config
// Agent writes brand profile info AND/OR integration credentials
// Body: { brandId, ...fields }
//
// Writable brand profile fields:
//   name, description, logoUrl, website, phone, address, location, timezone
//
// Writable integration credential fields (brand owner must have granted access):
//   postfastApiKey, googlePlaceId, googleApiKey,
//   larkAppId, larkAppSecret, larkDriveFolderId, larkBotWebhook, larkOwnerId
export async function PATCH(request: Request) {
  const agent = await getAgent(request)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { brandId, ...fields } = body

  if (!brandId) {
    return NextResponse.json(
      { error: 'brandId required. PATCH only updates an existing brand; use POST /api/agent/brand-config to create a new brand explicitly.' },
      { status: 400 }
    )
  }

  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (!(await canAgentAccessBrand(brandId, agent.id))) {
    return NextResponse.json({ error: 'Brand not linked to this agent' }, { status: 403 })
  }

  // Whitelist: which fields an Agent is allowed to write
  const AGENT_WRITABLE_PROFILE = ['name', 'description', 'logoUrl', 'website', 'phone', 'address', 'location', 'timezone'] as const
  const AGENT_WRITABLE_CREDENTIALS = ['postfastApiKey', 'googlePlaceId', 'googleApiKey', 'larkAppId', 'larkAppSecret', 'larkParentFolderToken', 'larkDriveFolderId', 'larkBotWebhook', 'larkOwnerId', 'googleAccountId', 'googleLocationId', 'googleLocationName'] as const
  const ALL_WRITABLE = [...AGENT_WRITABLE_PROFILE, ...AGENT_WRITABLE_CREDENTIALS]

  const updateData: Record<string, unknown> = {}
  for (const key of ALL_WRITABLE) {
    if (fields[key] !== undefined) {
      // Empty string = clear the field
      updateData[key] = fields[key] === '' ? null : fields[key]
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No writable fields provided' }, { status: 400 })
  }

  const updated = await prisma.brand.update({
    where: { id: brandId },
    data: updateData,
    select: {
      id: true, name: true, description: true, logoUrl: true,
      website: true, phone: true, address: true, location: true,
      postfastApiKey: true, googlePlaceId: true, googleApiKey: true,
      larkAppId: true, larkAppSecret: true, larkParentFolderToken: true, larkDriveFolderId: true,
      googleAccountId: true, googleLocationId: true, googleLocationName: true,
    },
  })

  // Auto-create Lark workspace folder is disabled as Lark Drive is decommissioned
  let larkFolderUrl: string | undefined = undefined

  // Auto-sync PostFast accounts when API key is present
  let postfastSync: { synced: number; accounts: string[] } | undefined
  const activeKey = updated.postfastApiKey
  if (activeKey) {
    try {
      const pfResult = await postfastFetchAccounts(activeKey)
      if (pfResult.success && pfResult.accounts.length > 0) {
        for (const acc of pfResult.accounts) {
          await prisma.socialAccount.upsert({
            where: { brandId_platformId_handle: { brandId, platformId: acc.platformId, handle: acc.handle } },
            create: { brandId, platformId: acc.platformId, handle: acc.handle, displayName: acc.displayName ?? acc.handle },
            update: { displayName: acc.displayName ?? acc.handle },
          })
        }

        // Prune stale accounts: delete any account that is not in the PostFast synced accounts list,
        // unless it's a direct Google Business Profile account.
        try {
          const postfastPlatformHandles = pfResult.accounts.map(acc => ({
            platformId: acc.platformId,
            handle: acc.handle
          }))

          const dbAccounts = await prisma.socialAccount.findMany({
            where: { brandId },
            select: { id: true, platformId: true, handle: true }
          })

          const brandInfo = await prisma.brand.findUnique({
            where: { id: brandId },
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
            console.log(`[Agent Sync] Deleted ${accountsToDelete.length} stale social accounts for brand ${brandId}`)
          }
        } catch (pruneErr) {
          console.warn('[Agent] Failed to prune stale social accounts:', pruneErr)
        }

        postfastSync = {
          synced: pfResult.accounts.length,
          accounts: pfResult.accounts.map(a => `${a.platformId}:${a.handle}`),
        }
        console.log(`[Agent] PostFast sync: ${pfResult.accounts.length} accounts for brand ${brandId}`)
      }
    } catch (e) {
      console.warn('[Agent] PostFast sync failed (non-fatal):', e)
    }
  }

  try {
    await refreshBrandProfileMarkdown(brandId)
  } catch {
    // non-fatal — do not block API success on markdown refresh failure
  }

  return NextResponse.json({
    ok: true,
    updated: Object.keys(updateData),
    larkFolderUrl,
    postfastSync,
    brand: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      logoUrl: updated.logoUrl,
      website: updated.website,
      phone: updated.phone,
      address: updated.address,
      location: updated.location,
      // Return configured status for credentials (never return raw secrets)
      postfastConfigured: !!updated.postfastApiKey,
      googleConfigured: !!(updated.googlePlaceId && updated.googleApiKey),
      larkConfigured: !!(updated.larkAppId && updated.larkAppSecret),
      larkDriveConfigured: !!updated.larkDriveFolderId,
    },
  })
}
