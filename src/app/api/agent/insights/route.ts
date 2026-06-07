import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!user || user.type !== 'AI_AGENT') {
      return NextResponse.json({ error: 'Not an AI Agent' }, { status: 403 })
    }

    const { insights } = await request.json()

    const updatedAgent = await prisma.user.update({
      where: { id: user.id },
      data: { insights }
    })

    return NextResponse.json({ success: true, insights: updatedAgent.insights })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
