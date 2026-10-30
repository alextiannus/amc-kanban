export const maxDuration = 30

import { activityStores } from '@/lib/activityStores'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canOwnBrand } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { translateActivityPage } from '@/lib/activityPageTranslation'
import { normalizeActivityPage, activityTranslationTasks } from '@/lib/activityPage'
import type { Prisma } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }
const revision = (page: unknown, reward: string | null) => createHash('sha256').update(JSON.stringify([normalizeActivityPage(page), reward])).digest('hex')
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params
  const session = await getSession()
  if (!session?.user || !await canOwnBrand(id, session.user.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const origin = request.headers.get('origin')
  if ((origin && !['https://amc-mm.immedi.ai', 'https://amc-kanban.immedi.ai', 'https://amc.immedi.ai', new URL(request.url).origin].includes(origin)) || request.headers.get('sec-fetch-site') === 'cross-site') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  let body: { activityPage?: unknown; followRewardDescription: string; revision: string }
  let page: ReturnType<typeof normalizeActivityPage>
  try {
    body = await request.json()
    if (!body || typeof body !== 'object') throw new Error('Invalid request')
    page = normalizeActivityPage(body.activityPage)
    if (typeof body.followRewardDescription !== 'string' || body.followRewardDescription.length > 500 || typeof body.revision !== 'string') return NextResponse.json({ error: 'Invalid page content' }, { status: 400 })
  } catch { return NextResponse.json({ error: 'Invalid page content' }, { status: 400 }) }
  try {
    const original = await prisma.brand.findUnique({ where: { id }, select: { activityPage: true, followRewardDescription: true } })
    if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (revision(original.activityPage, original.followRewardDescription) !== body.revision) return NextResponse.json({ error: 'This page changed. Reload before saving.' }, { status: 409 })
    page = await translateActivityPage(page, body.followRewardDescription.trim())
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM "Brand" WHERE id = ${id} FOR UPDATE`
      const current = await tx.brand.findUnique({ where: { id }, select: { activityPage: true, followRewardDescription: true } })
      if (!current) return { status: 404, error: 'Not found' }
      if (revision(current.activityPage, current.followRewardDescription) !== body.revision) return { status: 409, error: 'This page changed. Reload before saving.' }
      if (page.drawEnabled) {
        const game = await tx.gameConfig.findUnique({ where: { brandId: id }, select: { prizes: { select: { id: true } } } })
        if (!game?.prizes.length) return { status: 400, error: 'Save draw prizes before adding the draw to this page.', code: 'DRAW_NOT_CONFIGURED' }
      }
      const reward = body.followRewardDescription.trim()
      await tx.brand.update({ where: { id }, data: { activityPage: page as Prisma.InputJsonObject, followRewardDescription: reward } })
      await tx.auditLog.create({ data: { actorId: session.user.id, actorType: 'HUMAN', action: 'ACTIVITY_PAGE_UPDATED', resourceType: 'Brand', resourceId: id, metadata: { textLanguages: Object.keys(page.text), linkOverrides: Object.keys(page.links).length, drawEnabled: page.drawEnabled ?? null } } })
      return { status: 200, activityPage: page, translationPending: activityTranslationTasks(page, reward).length > 0, followRewardDescription: reward, revision: revision(page, reward) }
    })
    return NextResponse.json(result, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Unable to save page. Please try again.' }, { status: 500 }) }
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const session = await getSession()
  if (!session?.user || !await canOwnBrand(id, session.user.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const brand = await prisma.brand.findUnique({ where: { id }, select: { name: true, address: true, knowledge: { select: { stores: true } }, activityPage: true, followRewardDescription: true } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ activityStores: activityStores(brand.knowledge?.stores, brand), activityPage: await translateActivityPage(brand.activityPage, brand.followRewardDescription), followRewardDescription: brand.followRewardDescription, revision: revision(brand.activityPage, brand.followRewardDescription) }, { headers: { 'Cache-Control': 'no-store' } })
}

/** Translate a private draft without publishing it or changing any brand fields. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const session = await getSession()
  if (!session?.user || !await canOwnBrand(id, session.user.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const origin = request.headers.get('origin')
  if ((origin && !['https://amc-mm.immedi.ai', 'https://amc-kanban.immedi.ai', 'https://amc.immedi.ai', new URL(request.url).origin].includes(origin)) || request.headers.get('sec-fetch-site') === 'cross-site') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await request.json()
    if (typeof body?.followRewardDescription !== 'string' || body.followRewardDescription.length > 500) throw new Error('Invalid offer')
    const page = await translateActivityPage(normalizeActivityPage(body.activityPage), body.followRewardDescription)
    return NextResponse.json({ activityPage: page, translationPending: activityTranslationTasks(page, body.followRewardDescription).length > 0 }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Invalid page content' }, { status: 400 }) }
}
