import { NextResponse } from 'next/server'
import { canSessionWriteBrandProject } from '@/lib/brandAccess'
import { resolveBrandIdentity } from '@/lib/brandIdentity'
import {
  isGrowthIdentityField,
  resolveIdentitySyncConflict,
} from '@/lib/brandIdentitySync'
import { resolveSessionOrApiKey } from '@/lib/user-management/auth'

type Params = { params: Promise<{ id: string; field: string }> }

export async function POST(request: Request, { params }: Params) {
  const auth = await resolveSessionOrApiKey(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, field } = await params
  if (!(await canSessionWriteBrandProject(id, auth.user.id, auth.user.type))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!isGrowthIdentityField(field)) {
    return NextResponse.json({ error: 'Invalid Growth identity field' }, { status: 400 })
  }
  const body = await request.json().catch(() => null)
  const action = body?.action
  if (action !== 'retry' && action !== 'overwrite' && action !== 'use_growth') {
    return NextResponse.json({ error: 'Invalid sync action' }, { status: 400 })
  }

  const result = await resolveIdentitySyncConflict({
    brandId: id,
    field,
    action,
    actor: auth.user,
  })
  const identity = await resolveBrandIdentity(id, { canEdit: true })
  if (!identity) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  const status = result.state === 'pending_sync' || result.state === 'sync_conflict' ? 202 : 200
  return NextResponse.json({
    ok: true,
    syncStatus: result.state,
    growthAvailable: identity.growthAvailable,
    field: identity.fields[field],
  }, { status })
}
