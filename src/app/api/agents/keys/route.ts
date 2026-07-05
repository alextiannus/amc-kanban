import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  apiKeyPrefix,
  authenticateCurrentSession,
  createApiKeyToken,
  hashApiKeyToken,
  requireCapability,
} from '@/lib/auth-v2'

export async function POST() {
  try {
    const principal = await authenticateCurrentSession()
    if (!principal) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await requireCapability(principal, 'agent.manage')
    if (principal.actorType !== 'HUMAN') {
      return NextResponse.json({ error: 'Agent API Keys must be created under a human user' }, { status: 400 })
    }

    const plaintextApiKey = createApiKeyToken('amc_agent')

    const key = await prisma.userApiKey.create({
      data: {
        userId: principal.userId,
        token: plaintextApiKey,
        tokenHash: hashApiKeyToken(plaintextApiKey),
        prefix: apiKeyPrefix(plaintextApiKey),
        name: 'AI Staff API Key',
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ 
      apiKey: plaintextApiKey,
      key,
      userId: principal.userId,
      message: 'Agent Key generated successfully under the current user. Please configure this in your OpenClaw MCP plugin.'
    })
  } catch (error: any) {
    if (error?.status === 403) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('Error generating agent key:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
