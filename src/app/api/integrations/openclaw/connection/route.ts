import { NextResponse } from 'next/server'
import { extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  buildOpenclawConnectionProfile,
  normalizeOpenclawAgentConfig,
} from '@/lib/integrations/openclaw'

export const dynamic = 'force-dynamic'

function resolveOrigin(request: Request): string {
  const url = new URL(request.url)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host')

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }

  return `${url.protocol}//${url.host}`
}

async function getAuthorizedAgent(request: Request) {
  const apiKey = extractApiKey(request)
  if (!apiKey) {
    return { ok: false as const, status: 401, error: 'Unauthorized: missing API key' }
  }

  const authAgent = await getAgentFromApiKey(apiKey)
  if (!authAgent || authAgent.type !== 'AI_AGENT') {
    return { ok: false as const, status: 401, error: 'Unauthorized: invalid API key' }
  }

  const agent = await prisma.user.findUnique({
    where: { id: authAgent.id },
    select: {
      id: true,
      email: true,
      apiKey: true,
      chatLink: true,
      driveFolder: true,
      agentProvider: true,
      nickname: true,
      workflow: true,
    },
  })

  if (!agent) {
    return { ok: false as const, status: 404, error: 'Agent not found' }
  }

  return { ok: true as const, apiKey, agent }
}

export async function GET(request: Request) {
  const auth = await getAuthorizedAgent(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const profile = buildOpenclawConnectionProfile({
    origin: resolveOrigin(request),
    agentApiKey: auth.apiKey,
    agentId: auth.agent.id,
    chatLink: auth.agent.chatLink,
    driveFolder: auth.agent.driveFolder,
  })

  return NextResponse.json({
    ok: true,
    connectionReady: !!auth.agent.chatLink,
    profile,
  })
}

export async function PATCH(request: Request) {
  const auth = await getAuthorizedAgent(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = await request.json()
  const normalized = normalizeOpenclawAgentConfig({
    chatLink: typeof body?.chatLink === 'string' ? body.chatLink : undefined,
    driveFolder: typeof body?.driveFolder === 'string' ? body.driveFolder : undefined,
  })

  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {
    agentProvider: 'OPENCLAW',
  }

  if (body?.chatLink !== undefined) updateData.chatLink = normalized.data.chatLink
  if (body?.driveFolder !== undefined) updateData.driveFolder = normalized.data.driveFolder

  if (typeof body?.nickname === 'string') updateData.nickname = body.nickname.trim() || null
  if (typeof body?.workflow === 'string') updateData.workflow = body.workflow.trim() || null

  const updated = await prisma.user.update({
    where: { id: auth.agent.id },
    data: updateData,
    select: {
      id: true,
      chatLink: true,
      driveFolder: true,
      agentProvider: true,
      nickname: true,
      workflow: true,
    },
  })

  const profile = buildOpenclawConnectionProfile({
    origin: resolveOrigin(request),
    agentApiKey: auth.apiKey,
    agentId: updated.id,
    chatLink: updated.chatLink,
    driveFolder: updated.driveFolder,
  })

  return NextResponse.json({
    ok: true,
    updated,
    profile,
  })
}
