import { after, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canOwnBrand } from '@/lib/brandAccess'
import {
  getGameShareDraftPoolStatus,
  queueGameShareDraftPoolRefill,
  requestGameShareDraftPoolRefill,
} from '@/lib/gameShareDraftPool'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function authorizedConfig(brandId: string) {
  const session = await getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!await canOwnBrand(brandId, session.user.id)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const config = await prisma.gameConfig.findUnique({ where: { brandId }, select: { id: true } })
  if (!config) return { error: NextResponse.json({ error: 'Game config not found' }, { status: 404 }) }
  return { config }
}

export async function GET(request: Request) {
  const brandId = new URL(request.url).searchParams.get('brandId')?.trim() || ''
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  const auth = await authorizedConfig(brandId)
  if ('error' in auth) return auth.error
  await queueGameShareDraftPoolRefill(auth.config.id)
  after(async () => {
    await requestGameShareDraftPoolRefill(auth.config.id)
  })
  const pool = await getGameShareDraftPoolStatus(auth.config.id)
  return NextResponse.json({ pool })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const brandId = typeof body?.brandId === 'string' ? body.brandId.trim() : ''
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  const auth = await authorizedConfig(brandId)
  if ('error' in auth) return auth.error
  await queueGameShareDraftPoolRefill(auth.config.id)
  after(async () => {
    await requestGameShareDraftPoolRefill(auth.config.id)
  })
  return NextResponse.json({ accepted: true }, { status: 202 })
}
