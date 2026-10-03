import { NextResponse } from 'next/server'
import { analysisActor } from '@/lib/asset-analysis/auth'
import { getCreditSnapshot } from '@/lib/amc-credit/service'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const { id: brandId } = await params
  try {
    await analysisActor(request, brandId)
    const snapshot = await getCreditSnapshot(brandId)
    return NextResponse.json({ brandId, planId: snapshot.account.planId, allowOverage: snapshot.account.allowOverage,
      allowNightlyOverage: snapshot.account.allowNightlyOverage, cycleStart: snapshot.cycle.startsAt, cycleEnd: snapshot.cycle.endsAt,
      ...snapshot.summary, entries: snapshot.entries.slice(0, 100).map((entry: { id: string; kind: string; taskType: string | null; taskId: string | null; creditDelta: number; createdAt: Date }) => ({ id: entry.id, kind: entry.kind, taskType: entry.taskType, taskId: entry.taskId, creditDelta: entry.creditDelta, createdAt: entry.createdAt })) })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unable to load AMC Credit' }, { status: error.status || 400 })
  }
}
