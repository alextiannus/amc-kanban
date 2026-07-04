import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import {
  apiKeyPrefix,
  authenticateCurrentSession,
  createApiKeyToken,
  hashApiKeyToken,
  hashPassword,
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
      introduction,
      workflow,
      themeColor,
      avatar,
      insights,
      chatLink,
      driveFolder,
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

    const email = `${normalizedAgentId}@agent.amc.local`
    const existingAgent = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    })

    if (existingAgent) {
      return NextResponse.json({ error: 'agentId already exists' }, { status: 409 })
    }

    const randomPassword = crypto.randomBytes(24).toString('hex')
    const hashedPassword = await hashPassword(randomPassword)
    const plaintextApiKey = createApiKeyToken('amc_agent')

    const newAgent = await prisma.$transaction(async (tx: any) => {
      const agent = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          type: 'AI_AGENT',
          role: 'USER',
          nickname: nickname.trim(),
          introduction: typeof introduction === 'string' ? introduction : null,
          workflow: typeof workflow === 'string' ? workflow : null,
          themeColor: typeof themeColor === 'string' ? themeColor : null,
          avatar: typeof avatar === 'string' ? avatar : null,
          insights: typeof insights === 'string' ? insights : null,
          chatLink: typeof chatLink === 'string' ? chatLink : null,
          driveFolder: typeof driveFolder === 'string' ? driveFolder : null,
          ownerId: principal?.userId ?? null,
          businessRoles: { create: { role: 'AMC_PRINCIPAL' } },
        },
        select: {
          id: true,
          email: true,
          nickname: true,
          type: true,
          createdAt: true,
        },
      })
      await tx.userApiKey.create({
        data: {
          userId: agent.id,
          tokenHash: hashApiKeyToken(plaintextApiKey),
          prefix: apiKeyPrefix(plaintextApiKey),
          name: 'Initial AMC Agent API Key',
        },
      })
      return agent
    })

    return NextResponse.json({
      success: true,
      message: 'Agent registered successfully',
      agent: {
        id: newAgent.id,
        agentId: normalizedAgentId,
        email: newAgent.email,
        nickname: newAgent.nickname,
        type: newAgent.type,
        createdAt: newAgent.createdAt,
      },
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
