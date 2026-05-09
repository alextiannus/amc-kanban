import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function GET() {
  try {
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
