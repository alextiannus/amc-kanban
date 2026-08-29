import { NextResponse } from 'next/server'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { submitVideoGeneration } from '@/lib/videoProduction'

export const maxDuration = 120

export async function POST(request: Request) {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')

  const expectedToken = process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim()
    || (isLocal ? 'local-internal-token' : undefined)
  const suppliedToken = request.headers.get('x-content-service-token')?.trim()
  if (!expectedToken || suppliedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const brandId = stringOrEmpty(body.brandId)
  const actorId = stringOrEmpty(body.actorId)
  const actorType = stringOrEmpty(body.actorType) || 'HUMAN'
  const actorRole = stringOrEmpty(body.actorRole) || 'USER'
  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
  if (!actorId) return NextResponse.json({ error: 'actorId is required' }, { status: 400 })

  const ok = await canSessionAccessBrandProject(brandId, actorId, actorType, actorRole)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const plan = body.plan && typeof body.plan === 'object' ? body.plan : null
  if (!plan) return NextResponse.json({ error: 'plan is required' }, { status: 400 })

  try {
    const execution = await submitVideoGeneration({
      brandId,
      actorId,
      plan: {
        ...plan,
        seedanceJobs: Array.isArray(body.seedanceJobs) ? body.seedanceJobs : plan.seedanceJobs,
        videoGenerationJobs: Array.isArray(body.videoGenerationJobs) ? body.videoGenerationJobs : plan.videoGenerationJobs,
      },
      creatorType: stringOrEmpty(body.creatorType),
      platform: stringOrEmpty(body.platform),
      seedanceJobs: Array.isArray(body.seedanceJobs) ? body.seedanceJobs : plan.seedanceJobs,
      assetIds: stringArray(body.assetIds),
      imageUrls: stringArray(body.imageUrls),
    })
    return NextResponse.json(execution)
  } catch (err: any) {
    console.error('[InternalVideoGenerate] failed:', err)
    return NextResponse.json({ error: err.message || 'Video generation failed' }, { status: statusFromError(err) })
  }
}

function statusFromError(err: any): number {
  return typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => stringOrEmpty(item)).filter(Boolean)
  if (typeof value === 'string') return value.split('\n').map((item) => item.trim()).filter(Boolean)
  return []
}
