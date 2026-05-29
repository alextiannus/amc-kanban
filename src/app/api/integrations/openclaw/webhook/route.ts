import { NextResponse } from 'next/server'
import { extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  normalizeOpenclawAgentConfig,
  parseOpenclawWebhookBody,
} from '@/lib/integrations/openclaw'

export const dynamic = 'force-dynamic'

async function resolveAgentByApiKey(request: Request) {
  const apiKey = extractApiKey(request)
  if (!apiKey) {
    return { ok: false as const, status: 401, error: 'Unauthorized: missing API key' }
  }

  const authAgent = await getAgentFromApiKey(apiKey)
  if (!authAgent || authAgent.type !== 'AI_AGENT') {
    return { ok: false as const, status: 401, error: 'Unauthorized: invalid API key' }
  }

  return { ok: true as const, agentId: authAgent.id }
}

export async function POST(request: Request) {
  const auth = await resolveAgentByApiKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let jsonBody: unknown = null
  try {
    jsonBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const event = parseOpenclawWebhookBody(jsonBody)
  const payload = event.payload ?? {}

  if (event.type === 'agent.config.updated') {
    const normalized = normalizeOpenclawAgentConfig({
      chatLink: typeof payload.chatLink === 'string' ? payload.chatLink : undefined,
      driveFolder: typeof payload.driveFolder === 'string' ? payload.driveFolder : undefined,
    })

    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 })
    }

    const updateData: Record<string, unknown> = { agentProvider: 'OPENCLAW' }
    if (payload.chatLink !== undefined) updateData.chatLink = normalized.data.chatLink
    if (payload.driveFolder !== undefined) updateData.driveFolder = normalized.data.driveFolder
    if (typeof payload.nickname === 'string') updateData.nickname = payload.nickname.trim() || null
    if (typeof payload.workflow === 'string') updateData.workflow = payload.workflow.trim() || null

    await prisma.user.update({ where: { id: auth.agentId }, data: updateData })

    return NextResponse.json({
      ok: true,
      accepted: true,
      eventType: event.type,
      updated: Object.keys(updateData),
    })
  }

  if (event.type === 'agent.connected') {
    await prisma.user.update({
      where: { id: auth.agentId },
      data: { agentProvider: 'OPENCLAW' },
    })
  }

  return NextResponse.json({
    ok: true,
    accepted: true,
    eventType: event.type,
  })
}
