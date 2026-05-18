import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createBrandWorkspace, DEFAULT_LARK_PARENT_FOLDER } from '@/lib/integrations/lark'

async function getAgent(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const key = auth.replace('Bearer ', '').trim()
  if (!key) return null
  return prisma.user.findFirst({ where: { apiKey: key, type: 'AI_AGENT' } })
}

// GET /api/agent/brand-config?brandId=<id>
// Agent fetches brand config including credentials for publishing
export async function GET(request: Request) {
  const agent = await getAgent(request)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      name: true,
      description: true,
      logoUrl: true,
      website: true,
      phone: true,
      address: true,
      location: true,
      timezone: true,
      autoPilot: true,
      postfastApiKey: true,
      googlePlaceId: true,
      googleApiKey: true,
      larkAppId: true,
      larkAppSecret: true,
      larkDriveToken: true,
      larkDriveFolderId: true,
      larkBotWebhook: true,
      larkOwnerId: true,
      accounts: {
        select: { id: true, platformId: true, handle: true, autoPilot: true },
      },
    },
  })

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  return NextResponse.json(brand)
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

  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  // Whitelist: which fields an Agent is allowed to write
  const AGENT_WRITABLE_PROFILE = ['name', 'description', 'logoUrl', 'website', 'phone', 'address', 'location', 'timezone'] as const
  const AGENT_WRITABLE_CREDENTIALS = ['postfastApiKey', 'googlePlaceId', 'googleApiKey', 'larkAppId', 'larkAppSecret', 'larkParentFolderToken', 'larkDriveFolderId', 'larkBotWebhook', 'larkOwnerId'] as const
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

  return NextResponse.json({
    ok: true,
    updated: Object.keys(updateData),
    larkFolderUrl,
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
