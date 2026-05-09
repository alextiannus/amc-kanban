import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const singleAgentMode = process.env.AI_SINGLE_AGENT_MODE === 'true'
    const canonicalAgentId = process.env.AI_SINGLE_AGENT_ID || 'amc-main'

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        type: true,
        role: true,
        permittedAgents: {
          include: { 
            agent: { 
              select: { 
                id: true, 
                email: true, 
                insights: true, 
                driveFolder: true, 
                chatLink: true 
              } 
            } 
          }
        }
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.role !== 'ADMIN' && user.type === 'HUMAN' && user.permittedAgents.length === 0) {
      return NextResponse.json({
        ...user,
        permittedAgents: []
      })
    }

    return NextResponse.json(user)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { password } = body

    if (!password || password.trim().length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 })
    }

    const bcrypt = require('bcryptjs')
    const hashedPassword = await bcrypt.hash(password, 10)

    await prisma.user.update({
      where: { id: session.user.id },
      data: { password: hashedPassword }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
