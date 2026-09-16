import { NextResponse } from 'next/server'
import { prisma } from '@/lib/asset-analysis/db'
import { analysisActor } from '@/lib/asset-analysis/auth'
import { createAnalysisBatch, applyAnalysisBatch, retryAnalysisBatch } from '@/lib/asset-analysis/service'

type Params = { params: Promise<{ id: string }> }
function errorResponse(error: any) { return NextResponse.json({ error: error.message || 'Image analysis failed' }, { status: error.status || 400 }) }

export async function GET(request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params
    await analysisActor(request, brandId)
    const batchId = new URL(request.url).searchParams.get('batchId')
    if (batchId) {
      const batch = await prisma.assetAnalysisBatch.findFirst({ where: { id: batchId, brandId }, include: { items: { include: { asset: { select: { id: true, filename: true, url: true } } }, orderBy: { createdAt: 'asc' } } } })
      if (!batch) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const { summaryRequest: _, ...safe } = batch
      return NextResponse.json({ batch: { ...safe, items: batch.items.map(({ gatewayRequest: _request, ...item }) => item) } })
    }
    const batches = await prisma.assetAnalysisBatch.findMany({ where: { brandId }, select: { id: true, status: true, error: true, industry: true, createdAt: true, updatedAt: true, _count: { select: { items: true } } }, orderBy: { createdAt: 'desc' }, take: 50 })
    return NextResponse.json({ batches })
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params
    await analysisActor(request, brandId)
    const body = await request.json()
    if (!['selected', 'unanalyzed'].includes(body.scope) || (body.scope === 'selected' && (!Array.isArray(body.assetIds) || body.assetIds.some((id: unknown) => typeof id !== 'string')))) return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
    const batch = await createAnalysisBatch({ brandId, assetIds: body.assetIds, unanalyzed: body.scope === 'unanalyzed', language: body.language, batchKey: typeof body.requestKey === 'string' ? body.requestKey.slice(0, 100) : undefined })
    return NextResponse.json({ batch }, { status: 202 })
  } catch (error) { return errorResponse(error) }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: brandId } = await params
    await analysisActor(request, brandId)
    const body = await request.json()
    if (body.action === 'seal') {
      if (typeof body.batchKey !== 'string') throw new Error('batchKey required')
      await prisma.assetAnalysisBatch.updateMany({ where: { brandId, batchKey: body.batchKey }, data: { sealed: true } })
      return NextResponse.json({ ok: true })
    }
    if (typeof body.batchId !== 'string') throw new Error('batchId required')
    if (body.action === 'retry') return NextResponse.json({ batch: await retryAnalysisBatch(brandId, body.batchId) })
    if (body.action === 'apply') return NextResponse.json(await applyAnalysisBatch(brandId, body.batchId, body.assignments))
    throw new Error('Invalid action')
  } catch (error) { return errorResponse(error) }
}
