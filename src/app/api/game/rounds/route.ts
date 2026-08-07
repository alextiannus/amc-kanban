import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { canHumanAccessBrandProject, canOwnBrand } from '@/lib/brandAccess'
import {
  assertNoRoundOverlap,
  assertNewRoundWindow,
  assertRoundWindow,
  assertValidTimeZone,
  parseRoundDate,
} from '@/lib/gameActivityRounds'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function authorizedBrand(brandId: string, write: boolean) {
  const session = await getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const allowed = write
    ? await canOwnBrand(brandId, session.user.id)
    : await canHumanAccessBrandProject(brandId, session.user.id, session.user.role)
  if (!allowed) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { session }
}

async function gameConfigForBrand(brandId: string) {
  return prisma.gameConfig.findUnique({
    where: { brandId },
    select: { id: true, brand: { select: { timezone: true } } },
  })
}

function brandTimezone(config: NonNullable<Awaited<ReturnType<typeof gameConfigForBrand>>>) {
  const timezone = config.brand.timezone || 'Asia/Singapore'
  assertValidTimeZone(timezone)
  return timezone
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to manage activity rounds'
  const conflict = /overlap|future round|active round|ended round/i.test(message)
  return NextResponse.json({ error: message }, { status: conflict ? 409 : 400 })
}

export async function GET(request: Request) {
  const brandId = new URL(request.url).searchParams.get('brandId')?.trim() || ''
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  const auth = await authorizedBrand(brandId, false)
  if ('error' in auth) return auth.error

  const config = await gameConfigForBrand(brandId)
  if (!config) return NextResponse.json({ error: 'Game config not found' }, { status: 404 })
  const timezone = brandTimezone(config)
  const rounds = await prisma.gameActivityRound.findMany({
    where: { gameConfigId: config.id },
    orderBy: { startsAt: 'asc' },
    select: { id: true, startsAt: true, endsAt: true, createdAt: true, updatedAt: true },
  })
  return NextResponse.json({ rounds, timezone })
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const brandId = typeof body?.brandId === 'string' ? body.brandId.trim() : ''
    if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })
    const auth = await authorizedBrand(brandId, true)
    if ('error' in auth) return auth.error

    const config = await gameConfigForBrand(brandId)
    if (!config) return NextResponse.json({ error: 'Game config not found' }, { status: 404 })
    brandTimezone(config)
    const startsAt = parseRoundDate(body.startsAt, 'startsAt')
    const endsAt = parseRoundDate(body.endsAt, 'endsAt')
    assertNewRoundWindow(startsAt, endsAt)

    const round = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertNoRoundOverlap(tx, { gameConfigId: config.id, startsAt, endsAt })
      return tx.gameActivityRound.create({
        data: { gameConfigId: config.id, startsAt, endsAt },
        select: { id: true, startsAt: true, endsAt: true, createdAt: true, updatedAt: true },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return NextResponse.json({ round }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/game/rounds]', error)
    return errorResponse(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const brandId = typeof body?.brandId === 'string' ? body.brandId.trim() : ''
    const roundId = typeof body?.roundId === 'string' ? body.roundId.trim() : ''
    if (!brandId || !roundId) return NextResponse.json({ error: 'brandId and roundId required' }, { status: 400 })
    const auth = await authorizedBrand(brandId, true)
    if ('error' in auth) return auth.error

    const config = await gameConfigForBrand(brandId)
    if (!config) return NextResponse.json({ error: 'Game config not found' }, { status: 404 })
    brandTimezone(config)
    const current = await prisma.gameActivityRound.findFirst({
      where: { id: roundId, gameConfigId: config.id },
      select: { id: true, startsAt: true, endsAt: true },
    })
    if (!current) return NextResponse.json({ error: 'Activity round not found' }, { status: 404 })

    const now = new Date()
    if (current.endsAt <= now) throw new Error('An ended round is read-only.')
    const isActive = current.startsAt <= now
    const startsAt = body.startsAt === undefined ? current.startsAt : parseRoundDate(body.startsAt, 'startsAt')
    const endsAt = body.endsAt === undefined ? current.endsAt : parseRoundDate(body.endsAt, 'endsAt')
    if (isActive && startsAt.getTime() !== current.startsAt.getTime()) {
      throw new Error('The start time of an active round is locked.')
    }
    if (!isActive && startsAt <= now) throw new Error('A future round must remain in the future.')
    if (isActive && endsAt <= now) throw new Error('An active round end time must remain in the future.')
    assertRoundWindow(startsAt, endsAt)

    const round = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertNoRoundOverlap(tx, { gameConfigId: config.id, startsAt, endsAt, excludeRoundId: roundId })
      return tx.gameActivityRound.update({
        where: { id: roundId },
        data: { startsAt, endsAt },
        select: { id: true, startsAt: true, endsAt: true, createdAt: true, updatedAt: true },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return NextResponse.json({ round })
  } catch (error) {
    console.error('[PATCH /api/game/rounds]', error)
    return errorResponse(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url)
    const brandId = url.searchParams.get('brandId')?.trim() || ''
    const roundId = url.searchParams.get('roundId')?.trim() || ''
    if (!brandId || !roundId) return NextResponse.json({ error: 'brandId and roundId required' }, { status: 400 })
    const auth = await authorizedBrand(brandId, true)
    if ('error' in auth) return auth.error

    const config = await gameConfigForBrand(brandId)
    if (!config) return NextResponse.json({ error: 'Game config not found' }, { status: 404 })
    brandTimezone(config)
    const round = await prisma.gameActivityRound.findFirst({
      where: { id: roundId, gameConfigId: config.id },
      select: { startsAt: true },
    })
    if (!round) return NextResponse.json({ error: 'Activity round not found' }, { status: 404 })
    if (round.startsAt <= new Date()) throw new Error('Only a future round can be deleted.')

    await prisma.gameActivityRound.delete({ where: { id: roundId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/game/rounds]', error)
    return errorResponse(error)
  }
}
