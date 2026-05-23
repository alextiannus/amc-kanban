import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, encrypt } from '@/lib/auth'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const agentUuid = crypto.randomUUID()
    const tempEmail = `pending-${agentUuid}@agent.amc.local`
    const placeholderApiKey = `placeholder-${agentUuid}`

    // 1. Create the placeholder agent record
    const newAgent = await prisma.user.create({
      data: {
        email: tempEmail,
        password: crypto.randomBytes(16).toString('hex'), // random unguessable password
        type: 'AI_AGENT',
        nickname: '🤖 未初始化龙虾',
        apiKey: placeholderApiKey
      }
    })

    // 2. Generate long-lived signed JWT key (starts with eyJ...)
    const plaintextApiKey = await encrypt({ agentId: newAgent.id, type: 'AI_AGENT' }, '36500d')

    // 3. Update the agent record with the final JWT apiKey
    await prisma.user.update({
      where: { id: newAgent.id },
      data: { apiKey: plaintextApiKey }
    })

    // 4. Bind the agent strictly to the human user who generated it
    await prisma.agentPermission.create({
      data: {
        humanId: session.user.id,
        agentId: newAgent.id
      }
    })

    // 4. Return the plaintext key (this is the ONLY time it will ever be shown)
    return NextResponse.json({ 
      apiKey: plaintextApiKey,
      agentId: newAgent.id,
      message: 'Agent Key generated successfully. Please configure this in your OpenClaw MCP plugin.'
    })
  } catch (error) {
    console.error('Error generating agent key:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
