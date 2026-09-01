import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canSessionWriteBrandProject } from '@/lib/brandAccess'
import { disableBrandVoiceProfile, updateBrandVoiceProfile } from '@/lib/brandVoiceProfiles'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string; voiceProfileId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  const { id: brandId, voiceProfileId } = await params
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ok = await canSessionWriteBrandProject(brandId, session.user.id, session.user.type ?? 'HUMAN')
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const result = await updateBrandVoiceProfile(brandId, voiceProfileId, body)
  if (!result) return NextResponse.json({ error: 'Voice profile not found' }, { status: 404 })
  return NextResponse.json(result)
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getSession()
  const { id: brandId, voiceProfileId } = await params
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ok = await canSessionWriteBrandProject(brandId, session.user.id, session.user.type ?? 'HUMAN')
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await disableBrandVoiceProfile(brandId, voiceProfileId)
  if (!result) return NextResponse.json({ error: 'Voice profile not found' }, { status: 404 })
  return NextResponse.json(result)
}
