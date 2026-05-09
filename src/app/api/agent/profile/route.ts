import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const agent = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (!agent || agent.type !== 'AI_AGENT') {
      return NextResponse.json({ error: 'Not an AI Agent' }, { status: 403 })
    }

    const { password, ...data } = agent
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
