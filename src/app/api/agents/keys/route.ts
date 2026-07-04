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

export async function POST() {
  try {
    const principal = await authenticateCurrentSession()
    if (!principal) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await requireCapability(principal, 'agent.manage')

    const agentUuid = crypto.randomUUID()
    const tempEmail = `pending-${agentUuid}@agent.amc.local`
    const plaintextApiKey = createApiKeyToken('amc_agent')

    const newAgent = await prisma.$transaction(async (tx: any) => {
      const agent = await tx.user.create({
        data: {
          email: tempEmail,
          password: await hashPassword(crypto.randomBytes(32).toString('base64url')),
          type: 'AI_AGENT',
          nickname: '🤖 未初始化龙虾',
          ownerId: principal.userId,
          businessRoles: { create: { role: 'AMC_PRINCIPAL' } },
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
      apiKey: plaintextApiKey,
      agentId: newAgent.id,
      message: 'Agent Key generated successfully. Please configure this in your OpenClaw MCP plugin.'
    })
  } catch (error: any) {
    if (error?.status === 403) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('Error generating agent key:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
