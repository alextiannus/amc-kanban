import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const { humanId, agentIds } = await request.json()

    if (!humanId || !Array.isArray(agentIds)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    await prisma.agentPermission.deleteMany({
      where: { humanId }
    })

    if (agentIds.length > 0) {
      await prisma.agentPermission.createMany({
        data: agentIds.map(agentId => ({
          humanId,
          agentId
        }))
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
