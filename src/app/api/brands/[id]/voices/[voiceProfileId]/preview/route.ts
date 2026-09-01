import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { previewBrandVoiceProfile } from '@/lib/brandVoiceProfiles'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string; voiceProfileId: string }> }

export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  const { id: brandId, voiceProfileId } = await params
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ok = await canSessionAccessBrandProject(brandId, session.user.id, session.user.type ?? 'HUMAN', session.user.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  try {
    const preview = await previewBrandVoiceProfile(brandId, voiceProfileId, {
      text: body?.text,
      actorId: session.user.id,
      actorType: session.user.type ?? 'HUMAN',
      actorRole: session.user.role,
    })
    if (!preview) return NextResponse.json({ error: 'Voice profile not found or not ready' }, { status: 404 })
    return new Response(new Uint8Array(preview.result.audio), {
      status: 200,
      headers: {
        'Content-Type': preview.result.contentType,
        'Cache-Control': 'private, no-store',
        'X-Brand-Voice-Profile': preview.profile.id,
        'X-TTS-Provider': String(preview.result.provenance.provider),
        'X-TTS-Model': String(preview.result.provenance.modelName),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Voice preview failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
