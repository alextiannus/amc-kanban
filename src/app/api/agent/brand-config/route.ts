import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createBrandWorkspace, DEFAULT_LARK_PARENT_FOLDER } from '@/lib/integrations/lark'
import { postfastFetchAccounts } from '@/lib/integrations/postfast'
import { extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { refreshBrandProfileMarkdown } from '@/lib/brandProfileMarkdown'

async function hasAvailableBrandSubscriptionSlot(userId: string) {
  const availableBrandPackageSlots = await prisma.brandSubscription.count({
    where: {
      createdById: userId,
      status: 'ACTIVE',
      brandId: null,
    },
  })

  return {
    ok: availableBrandPackageSlots > 0,
    availableBrandPackageSlots,
  }
}

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
      where: { agentId: agent.id, active: true },
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
    const safeBrands = links.map((l) => toPublicBrand(l.brand))
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

  return NextResponse.json(toPublicBrand(brand))
}

// POST /api/agent/brand-config
// Agent creates a new brand autonomously.
// Owners = all HUMAN users who have this agent in their AgentPermission table.
// If no humans are linked, falls back to the first ADMIN user.
//
// Body: { name, location?, timezone? }
export async function POST(request: Request) {
  const agent = await getAgent(request)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, location, timezone } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const normalizedName = name.trim()

  // Deduplicate by agent + brand name: if this agent already created/linked the same brand,
  // return the existing one instead of creating a duplicate record.
  const existingForAgent = await prisma.brandAgent.findFirst({
    where: {
      agentId: agent.id,
      brand: {
        name: {
          equals: normalizedName,
          mode: 'insensitive',
        },
      },
    },
    include: {
      brand: {
        select: {
          id: true,
          name: true,
          location: true,
          timezone: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (existingForAgent?.brand) {
    if (!existingForAgent.active) {
      await prisma.brandAgent.update({
        where: { id: existingForAgent.id },
        data: { active: true },
      })
    }

    return NextResponse.json({
      ok: true,
      created: false,
      deduplicated: true,
      brand: existingForAgent.brand,
      message: 'Brand already exists for this agent. Reusing existing brand.',
    })
  }

  // Find all human users linked to this agent via AgentPermission
  const permissions = await prisma.agentPermission.findMany({
    where: { agentId: agent.id },
    include: { human: { select: { id: true, email: true, role: true } } },
  })
  let linkedHumans = permissions.map(p => p.human)

  // Fallback: use first ADMIN if agent has no linked humans yet
  if (linkedHumans.length === 0) {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, role: true },
    })
    if (!admin) {
      return NextResponse.json(
        { error: 'No admin user found. Please complete system bootstrap first.' },
        { status: 503 }
      )
    }
    linkedHumans = [admin]
  }

  const primaryOwnerId = linkedHumans[0].id

  const entitlement = await hasAvailableBrandSubscriptionSlot(primaryOwnerId)
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: '每个品牌都需要独立订阅配套。当前无可用配套额度，请先购买新的品牌配套后再创建品牌。',
        code: 'SUBSCRIPTION_REQUIRED_PER_BRAND',
        redirectTo: '/board/subscription',
        summary: {
          availableBrandPackageSlots: entitlement.availableBrandPackageSlots,
        },
      },
      { status: 402 }
    )
  }

  const creation = await prisma.$transaction(async (tx) => {
    const subscriptionToBind = await tx.brandSubscription.findFirst({
      where: {
        createdById: primaryOwnerId,
        status: 'ACTIVE',
        brandId: null,
      },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, planId: true, planName: true, status: true },
    })

    if (!subscriptionToBind) return null

    const brand = await tx.brand.create({
      data: {
        ownerId: primaryOwnerId,
        name: normalizedName,
        location: location?.trim() || null,
        timezone: timezone || 'Asia/Singapore',
      },
    })

    await tx.brandOwner.createMany({
      data: linkedHumans.map(h => ({ brandId: brand.id, userId: h.id })),
      skipDuplicates: true,
    })

    await tx.brandAgent.upsert({
      where: { brandId_agentId: { brandId: brand.id, agentId: agent.id } },
      create: { brandId: brand.id, agentId: agent.id, role: 'worker', active: true },
      update: { active: true },
    })

    await tx.brandSubscription.update({
      where: { id: subscriptionToBind.id },
      data: { brandId: brand.id },
    })

    return { brand, boundSubscription: subscriptionToBind }
  })

  if (!creation) {
    return NextResponse.json(
      {
        error: '每个品牌都需要独立订阅配套。当前无可用配套额度，请先购买新的品牌配套后再创建品牌。',
        code: 'SUBSCRIPTION_REQUIRED_PER_BRAND',
        redirectTo: '/board/subscription',
      },
      { status: 402 }
    )
  }

  const { brand, boundSubscription } = creation

  return NextResponse.json({
    ok: true,
    created: true,
    owners: linkedHumans.map(h => ({ id: h.id, email: h.email })),
    brand: {
      id: brand.id,
      name: brand.name,
      location: brand.location,
      timezone: brand.timezone,
    },
    subscription: {
      id: boundSubscription.id,
      planId: boundSubscription.planId,
      planName: boundSubscription.planName,
      status: boundSubscription.status,
    },
  }, { status: 201 })
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

  // Auto-register agent to this brand (MCP self-registration)
  await prisma.brandAgent.upsert({
    where: { brandId_agentId: { brandId, agentId: agent.id } },
    create: { brandId, agentId: agent.id, role: 'worker', active: true },
    update: { active: true },
  })

  // Auto-create Lark workspace folder if brand has Lark creds but no workspace yet
  let larkFolderUrl: string | undefined
  if (updated.larkAppId && updated.larkAppSecret && !updated.larkDriveFolderId) {
    try {
      const workspace = await createBrandWorkspace({
        appId: updated.larkAppId,
        appSecret: updated.larkAppSecret,
        parentFolderToken: updated.larkParentFolderToken ?? DEFAULT_LARK_PARENT_FOLDER,
        brandName: updated.name,
      })
      if (workspace.success && workspace.folderToken) {
        await prisma.brand.update({
          where: { id: brandId },
          data: { larkDriveFolderId: workspace.folderToken },
        })
        updated.larkDriveFolderId = workspace.folderToken
        larkFolderUrl = workspace.folderUrl
        console.log(`[Agent] Created Lark workspace for "${updated.name}": ${workspace.folderUrl}`)
      }
    } catch (e) {
      console.warn('[Agent] Lark workspace creation failed (non-fatal):', e)
    }
  }

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
