import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import {allowedRoleWriteOrigin} from '@/lib/role-permissions/request-origin'
import {serializePublicVideoJob} from '@/lib/videoJobContract'
import {saveVideoJob} from '@/lib/videoJobPersistence'

export const dynamic = 'force-dynamic'

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: authenticatedAgent.role }
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
    if (!job || !job.createdBy || job.createdBy !== actor.id) return videoJobNotFoundResponse()

    const ok = await canSessionAccessBrandProject(job.brandId, actor.id, actor.type, actor.role)
    if (!ok) return videoJobNotFoundResponse()

    return NextResponse.json({ success: true, job: serializePublicVideoJob(job) })
  } catch (err: any) {
    console.error('[VideoJobs] get failed:', err)
    return NextResponse.json({ error: err.message || 'Video job lookup failed' }, { status: statusFromError(err) })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getActor(request)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if(!allowedRoleWriteOrigin(request))return NextResponse.json({error:'Forbidden'},{status:403})
    const raw=await request.text()
    if(Buffer.byteLength(raw,'utf8')>9*1024*1024)return NextResponse.json({error:'video_payload_too_large'},{status:413})
    const body = JSON.parse(raw)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const job = await saveVideoJob(actor, body)
    return NextResponse.json({ success: true, job: serializePublicVideoJob(job) })
  } catch (err: any) {
    console.error('[VideoJobs] save failed:', err)
    return NextResponse.json({ error: err.message || 'Video job save failed' }, { status: statusFromError(err) })
  }
}

function videoJobNotFoundResponse() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

function statusFromError(err: any) {
  if(err instanceof SyntaxError)return 400
  return typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
