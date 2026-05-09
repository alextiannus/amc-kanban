import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, verifyApiKey } from '@/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const isApiKeyValid = verifyApiKey(request)

    if (!session?.user && !isApiKeyValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const task = await prisma.workUnit.findUnique({
      where: { id },
      include: {
        assignee: {
          select: { id: true, email: true, type: true }
        }
      }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json(task)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const isApiKeyValid = verifyApiKey(request)

    if (!session?.user && !isApiKeyValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { title, description, materials, assigneeId } = body

    const data: any = {}
    if (title !== undefined) data.title = title
    if (description !== undefined) data.description = description
    if (materials !== undefined) data.materials = materials
    if (assigneeId !== undefined) data.assigneeId = assigneeId

    const updatedTask = await prisma.workUnit.update({
      where: { id },
      data
    })

    return NextResponse.json(updatedTask)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
