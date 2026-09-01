import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canSessionAccessBrandProject, canSessionWriteBrandProject } from '@/lib/brandAccess'
import { createBrandVoiceProfile, listBrandVoiceProfiles } from '@/lib/brandVoiceProfiles'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const session = await getSession()
  const { id: brandId } = await params
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ok = await canSessionAccessBrandProject(brandId, session.user.id, session.user.type ?? 'HUMAN', session.user.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await listBrandVoiceProfiles(brandId)
  return NextResponse.json(result)
}

export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  const { id: brandId } = await params
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ok = await canSessionWriteBrandProject(brandId, session.user.id, session.user.type ?? 'HUMAN')
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const file = form.get('file')
  const consentConfirmed = form.get('consentConfirmed') === 'true'
  if (!consentConfirmed) {
    return NextResponse.json({ error: '请先确认已获得该声音的使用授权。' }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Audio file is required' }, { status: 400 })
  }

  try {
    const result = await createBrandVoiceProfile({
      brandId,
      file,
      label: typeof form.get('label') === 'string' ? String(form.get('label')) : '',
      role: typeof form.get('role') === 'string' ? String(form.get('role')) : '',
      speakerName: typeof form.get('speakerName') === 'string' ? String(form.get('speakerName')) : '',
      actorId: session.user.id,
      actorType: session.user.type ?? 'HUMAN',
      actorRole: session.user.role,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Voice clone failed'
    const status = message === 'TTS_MODEL_NOT_CONFIGURED' ? 503 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
