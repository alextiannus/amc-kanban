import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  apiKeyPrefix,
  authenticateCurrentSession,
  createApiKeyToken,
  hashApiKeyToken,
  requireCapability,
} from '@/lib/auth-v2'

function normalizeAgentId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-')
}

function isSystemRegistrationAuthorized(request: Request): boolean {
  const systemApiKey = process.env.API_KEY?.trim()
  if (!systemApiKey) return false

  const headerApiKey = request.headers.get('x-api-key')?.trim()
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  return headerApiKey === systemApiKey || bearer === systemApiKey
}

export async function POST(request: Request) {
  try {
    const principal = await authenticateCurrentSession()
    const authorizedBySystemKey = isSystemRegistrationAuthorized(request)

    if (!authorizedBySystemKey && !principal) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!authorizedBySystemKey && principal) {
      await requireCapability(principal, 'agent.manage')
    }

    const body = await request.json()
    const {
      agentId,
      nickname,
      ownerUserId,
      ownerEmail,
    } = body

    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json({ error: 'agentId is required' }, { status: 400 })
    }

    if (!nickname || typeof nickname !== 'string') {
      return NextResponse.json({ error: 'nickname is required' }, { status: 400 })
    }

    const normalizedAgentId = normalizeAgentId(agentId)
    if (!normalizedAgentId) {
      return NextResponse.json({ error: 'agentId is invalid' }, { status: 400 })
    }

    let targetUserId = principal?.actorType === 'HUMAN' ? principal.userId : null
    if (!targetUserId) {
      const owner = await prisma.user.findFirst({
        where: ownerUserId
          ? { id: String(ownerUserId), type: 'HUMAN' }
          : ownerEmail
            ? { email: String(ownerEmail).trim().toLowerCase(), type: 'HUMAN' }
            : { id: '' },
        select: { id: true },
      })
      targetUserId = owner?.id || null
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'A human owner is required to create an Agent API Key' }, { status: 400 })
    }

    const plaintextApiKey = createApiKeyToken('amc_agent')

    const key = await prisma.userApiKey.create({
      data: {
        userId: targetUserId,
        token: plaintextApiKey,
        tokenHash: hashApiKeyToken(plaintextApiKey),
        prefix: apiKeyPrefix(plaintextApiKey),
        name: `AI Staff - ${nickname.trim()}`,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Agent API Key created successfully',
      agent: {
        id: key.id,
        agentId: normalizedAgentId,
        nickname: nickname.trim(),
        type: 'USER_API_KEY',
      },
      key,
      userId: targetUserId,
      apiKey: plaintextApiKey,
    })
  } catch (error: any) {
    if (error?.status === 403) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('Agent register error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
