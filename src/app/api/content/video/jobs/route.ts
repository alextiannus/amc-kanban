import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: 'USER' }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

export async function GET(request: Request) {
  try {
    const actor = await getActor(request)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const id = text(url.searchParams.get('id'))
    const brandId = text(url.searchParams.get('brandId'))
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const job = await prisma.videoProductionJob.findFirst({
      where: { id, ...(brandId ? { brandId } : {}) },
    })
    if (!job) return NextResponse.json({ error: 'Video job not found' }, { status: 404 })

    const ok = await canSessionAccessBrandProject(job.brandId, actor.id, actor.type, actor.role)
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ success: true, job: serializeJob(job) })
  } catch (err: any) {
    console.error('[VideoJobs] get failed:', err)
    return NextResponse.json({ error: err.message || 'Video job lookup failed' }, { status: statusFromError(err) })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getActor(request)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const id = text(body.id)
    const brandId = text(body.brandId)
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })

    const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = await prisma.videoProductionJob.findUnique({
      where: { id },
      select: { brandId: true },
    })
    if (existing && existing.brandId !== brandId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const job = await prisma.videoProductionJob.upsert({
      where: { id },
      create: {
        id,
        brandId,
        creativeId: optionalText(body.creativeId),
        title: text(body.title) || '短视频制作',
        platform: text(body.platform) || 'tiktok',
        idea: text(body.idea) || '根据所选素材制作一条适合发布的短视频。',
        status: text(body.status) || 'generating',
        progress: numberValue(body.progress) ?? 0,
        thumbnailUrl: optionalText(body.thumbnailUrl),
        finalVideoUrl: optionalText(body.finalVideoUrl),
        narration: optionalText(body.narration),
        musicBrief: optionalText(body.musicBrief),
        creatorType: optionalText(body.creatorType),
        aspectRatio: optionalText(body.aspectRatio),
        assetIds: stringArray(body.assetIds),
        mediaUrls: stringArray(body.mediaUrls),
        scenes: jsonValue(body.scenes, []),
        plan: jsonOrNull(body.plan),
        sceneExecutions: jsonOrNull(body.sceneExecutions),
        finalExecution: jsonOrNull(body.finalExecution),
        error: optionalText(body.error),
        createdBy: actor.id,
      },
      update: {
        creativeId: optionalText(body.creativeId),
        title: text(body.title) || '短视频制作',
        platform: text(body.platform) || 'tiktok',
        idea: text(body.idea) || '根据所选素材制作一条适合发布的短视频。',
        status: text(body.status) || 'generating',
        progress: numberValue(body.progress) ?? 0,
        thumbnailUrl: optionalText(body.thumbnailUrl),
        finalVideoUrl: optionalText(body.finalVideoUrl),
        narration: optionalText(body.narration),
        musicBrief: optionalText(body.musicBrief),
        creatorType: optionalText(body.creatorType),
        aspectRatio: optionalText(body.aspectRatio),
        assetIds: stringArray(body.assetIds),
        mediaUrls: stringArray(body.mediaUrls),
        scenes: jsonValue(body.scenes, []),
        plan: jsonOrNull(body.plan),
        sceneExecutions: jsonOrNull(body.sceneExecutions),
        finalExecution: jsonOrNull(body.finalExecution),
        error: optionalText(body.error),
      },
    })

    return NextResponse.json({ success: true, job: serializeJob(job) })
  } catch (err: any) {
    console.error('[VideoJobs] save failed:', err)
    return NextResponse.json({ error: err.message || 'Video job save failed' }, { status: statusFromError(err) })
  }
}

function serializeJob(job: any) {
  return {
    id: job.id,
    brandId: job.brandId,
    creativeId: job.creativeId,
    title: job.title,
    platform: job.platform,
    idea: job.idea,
    status: job.status,
    scenes: Array.isArray(job.scenes) ? job.scenes : [],
    finalVideoUrl: job.finalVideoUrl,
    thumbnailUrl: job.thumbnailUrl,
    narration: job.narration,
    musicBrief: job.musicBrief,
    progress: job.progress,
    error: job.error,
    plan: job.plan,
    creatorType: job.creatorType,
    aspectRatio: job.aspectRatio,
    assetIds: job.assetIds || [],
    mediaUrls: job.mediaUrls || [],
    sceneExecutions: job.sceneExecutions || {},
    finalExecution: job.finalExecution,
    createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : job.createdAt,
    updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : job.updatedAt,
  }
}

function statusFromError(err: any) {
  return typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500
}

function jsonOrNull(value: unknown) {
  return value && typeof value === 'object' ? value as any : null
}

function jsonValue(value: unknown, fallback: unknown) {
  return value && typeof value === 'object' ? value as any : fallback as any
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value))
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined
  }
  return undefined
}

function optionalText(value: unknown): string | null {
  const result = text(value)
  return result || null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => text(item)).filter(Boolean) : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
