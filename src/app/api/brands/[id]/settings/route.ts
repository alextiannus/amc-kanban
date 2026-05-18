import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

const MASKED_FIELDS = ['postfastApiKey', 'googleApiKey', 'larkAppSecret'] as const

function maskKey(key: string | null) {
  if (!key) return null
  return `••••••${key.slice(-4)}`
}

// GET /api/brands/[id]/settings
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const brand = await prisma.brand.findFirst({ where: { id, ownerId: session.user.id } })
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

    // Google Business
    googlePlaceId: brand.googlePlaceId,
    googleApiKey: maskKey(brand.googleApiKey),
    googleConfigured: !!(brand.googlePlaceId && brand.googleApiKey),

    // Lark
    larkAppId: brand.larkAppId,
    larkAppSecret: maskKey(brand.larkAppSecret),
    larkDriveFolderId: brand.larkDriveFolderId,
    larkBotWebhook: brand.larkBotWebhook,
    larkOwnerId: brand.larkOwnerId,
    larkConfigured: !!(brand.larkAppId && brand.larkAppSecret),
    larkDriveConfigured: !!(brand.larkAppId && brand.larkAppSecret && brand.larkDriveFolderId),
    larkNotifyConfigured: !!(brand.larkBotWebhook || brand.larkOwnerId),
  })
}

// PATCH /api/brands/[id]/settings
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const brand = await prisma.brand.findFirst({ where: { id, ownerId: session.user.id } })
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
      // Lark
      ...(body.larkAppId !== undefined && { larkAppId: opt(body.larkAppId) }),
      ...(body.larkAppSecret !== undefined && { larkAppSecret: opt(body.larkAppSecret) }),
      ...(body.larkDriveFolderId !== undefined && { larkDriveFolderId: opt(body.larkDriveFolderId) }),
      ...(body.larkBotWebhook !== undefined && { larkBotWebhook: opt(body.larkBotWebhook) }),
      ...(body.larkOwnerId !== undefined && { larkOwnerId: opt(body.larkOwnerId) }),
    },
  })

  return NextResponse.json({
    ok: true,
    postfastConfigured: !!updated.postfastApiKey,
    googleConfigured: !!(updated.googlePlaceId && updated.googleApiKey),
    larkConfigured: !!(updated.larkAppId && updated.larkAppSecret),
    larkDriveConfigured: !!(updated.larkDriveFolderId),
    larkNotifyConfigured: !!(updated.larkBotWebhook || updated.larkOwnerId),
  })
}
