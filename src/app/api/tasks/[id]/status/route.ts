import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, verifyApiKey } from '@/lib/auth'

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
    const { status, requiredInput } = await request.json()

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 })
    }

    const data: any = { status }
    
    // Specifically handle requiredInput, allowing null to clear it
    if (requiredInput !== undefined) {
      data.requiredInput = requiredInput
    }

    const updatedTask = await prisma.workUnit.update({
      where: { id },
      data
    })

    return NextResponse.json(updatedTask)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
