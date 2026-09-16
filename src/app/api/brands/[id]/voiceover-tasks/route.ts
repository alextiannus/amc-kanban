import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canSessionWriteBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { assertSelection, createVoiceoverTask, publicVoiceTask, resolveBrandVoiceSelection } from '@/lib/brandVoiceProfiles'

export const dynamic = 'force-dynamic'
type Params = { params: Promise<{ id: string }> }
async function actorFor(brandId: string) {
  const session = await getSession()
  if (!session?.user) throw Object.assign(new Error('Unauthorized'), { status: 401 })
  const user = session.user
  if (!await canSessionWriteBrandProject(brandId, user.id, user.type ?? 'HUMAN')) throw Object.assign(new Error('Not found'), { status: 404 })
  return { actorId: user.id, actorType: user.type ?? 'HUMAN', actorRole: user.role }
}
function failure(error: any) { return NextResponse.json({ error: error.message || 'Voice operation failed' }, { status: error.status || 502 }) }
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const actor = await actorFor(id)
    const body = await request.json()
    if (body.action === 'resolve') return NextResponse.json({ selection: await resolveBrandVoiceSelection(id, body) })
    if (body.action === 'validate') { await assertSelection(id, body.selection); return NextResponse.json({ ok: true }) }
    const task = await createVoiceoverTask(id, { ...body, ...actor })
    return NextResponse.json({ task: publicVoiceTask(task) }, { status: 202 })
  } catch (error) { return failure(error) }
}
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params
    await actorFor(id)
    const task = await prisma.voiceTask.findFirst({ where: { id: new URL(request.url).searchParams.get('id') || '', brandId: id, kind: 'narration' } })
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await assertSelection(id, (task.payload as any).selection)
    return NextResponse.json({ task: publicVoiceTask(task) })
  } catch (error) { return failure(error) }
}
