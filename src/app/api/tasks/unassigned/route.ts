import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { eventEmitter } from '@/lib/events'

export async function DELETE(request: Request) {
  try {
    const session = await getSession()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Only admins can clean up unassigned tasks' }, { status: 403 })
    }

    const result = await prisma.workUnit.deleteMany({
      where: {
        assigneeId: null
      }
    })

    if (result.count > 0) {
      eventEmitter.emit('board_update')
    }

    return NextResponse.json({ success: true, deletedCount: result.count })
  } catch (error) {
    console.error('Error deleting unassigned tasks:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
