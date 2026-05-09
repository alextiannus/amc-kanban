import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const singleAgentMode = process.env.AI_SINGLE_AGENT_MODE !== 'false'
    const canonicalAgentId = process.env.AI_SINGLE_AGENT_ID || 'amc-main'
    const canonicalEmail = `${canonicalAgentId}@agent.amc.local`

    if (singleAgentMode) {
      const aiAgents = await prisma.user.findMany({
        where: { type: 'AI_AGENT' },
        select: { id: true, email: true, createdAt: true },
        orderBy: { createdAt: 'asc' }
      })

      if (aiAgents.length > 1) {
        const canonicalAgent = aiAgents.find(agent => agent.email === canonicalEmail) || aiAgents[0]
        const duplicateIds = aiAgents.filter(agent => agent.id !== canonicalAgent.id).map(agent => agent.id)

        if (duplicateIds.length > 0) {
          const duplicatePermissions = await prisma.agentPermission.findMany({
            where: { agentId: { in: duplicateIds } },
            select: { humanId: true }
          })

          const uniqueHumanIds = Array.from(new Set(duplicatePermissions.map(item => item.humanId)))

          await prisma.$transaction(async (tx) => {
            if (canonicalAgent.email !== canonicalEmail) {
              await tx.user.update({
                where: { id: canonicalAgent.id },
                data: { email: canonicalEmail }
              })
            }

            if (uniqueHumanIds.length > 0) {
              await tx.agentPermission.createMany({
                data: uniqueHumanIds.map(humanId => ({ humanId, agentId: canonicalAgent.id })),
                skipDuplicates: true
              })
            }

            await tx.workUnit.updateMany({
              where: { assigneeId: { in: duplicateIds } },
              data: { assigneeId: canonicalAgent.id }
            })

            await tx.agentPermission.deleteMany({
              where: { agentId: { in: duplicateIds } }
            })

            await tx.user.deleteMany({
              where: { id: { in: duplicateIds } }
            })
          })
        }
      }
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        type: true,
        role: true,
        insights: true,
        driveFolder: true,
        chatLink: true,
        createdAt: true,
        permittedAgents: {
          include: { agent: { select: { id: true, email: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(users)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { email, type } = await request.json()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })
    
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return NextResponse.json({ error: 'User already exists' }, { status: 400 })

    const hashedPassword = await bcrypt.hash('234567', 10)
    const userType = type === 'AI_AGENT' ? 'AI_AGENT' : 'HUMAN'

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        type: userType,
        role: 'USER',
      }
    })

    return NextResponse.json({ success: true, user: { id: user.id, email: user.email, type: user.type } })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
