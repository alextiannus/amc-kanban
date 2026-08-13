import { NextResponse } from 'next/server'
import { resolveSessionOrApiKey } from '@/lib/user-management/auth'
import { canSessionAccessBrandProject, canSessionWriteBrandProject } from '@/lib/brandAccess'
import {
  getBrandGrowthSyncStatus,
  queueAndSyncBrandGrowth,
  resolveBrandGrowthConflicts,
} from '@/lib/brandGrowthSync'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const auth = await resolveSessionOrApiKey(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!(await canSessionAccessBrandProject(id, auth.user.id, auth.user.type, auth.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const status = await getBrandGrowthSyncStatus(id)
  return NextResponse.json(status || {
    brandId: id,
    status: 'NOT_QUEUED',
    pendingPaths: [],
    attempts: 0,
    nextRetryAt: null,
    errorCode: null,
    errorMessage: null,
    conflicts: [],
    lastSyncedAt: null,
  })
}

export async function POST(request: Request, { params }: Params) {
  const auth = await resolveSessionOrApiKey(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!(await canSessionWriteBrandProject(id, auth.user.id, auth.user.type))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const body = await request.json().catch(() => ({}))
  const actor = {
    id: auth.user.id,
    email: auth.user.email,
    type: auth.user.type,
    roles: auth.user.userRoles || [],
  }
  try {
    if (body.action === 'overwrite_growth' || body.action === 'use_growth') {
      const paths = Array.isArray(body.paths) ? body.paths.map(String) : []
      const result = await resolveBrandGrowthConflicts({ brandId: id, paths, action: body.action, actor })
      return NextResponse.json({ ok: true, ...result }, { status: result?.status === 'CONFLICT' ? 202 : 200 })
    }
    const result = await queueAndSyncBrandGrowth({
      brandId: id,
      dirtyPaths: Array.isArray(body.paths) && body.paths.length ? body.paths.map(String) : ['*'],
      actor,
    })
    return NextResponse.json({ ok: true, ...result }, { status: result?.status === 'SYNCED' ? 200 : 202 })
  } catch (error) {
    console.error('[brand-growth-sync] action failed:', error)
    return NextResponse.json({ error: 'Unable to process Growth sync action' }, { status: 400 })
  }
}
