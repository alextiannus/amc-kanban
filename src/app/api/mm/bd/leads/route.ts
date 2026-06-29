import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify role: BD or ADMIN
  const userRoles = await prisma.userBusinessRole.findMany({
    where: { userId: session.user.id },
    select: { role: true }
  })
  const roles = userRoles.map((r: { role: string }) => r.role)
  const isBD = roles.includes('BD')
  const isAdmin = session.user.role === 'ADMIN'

  if (!isBD && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const leads = await prisma.salesLead.findMany({
      where: { bdUserId: session.user.id },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ leads })
  } catch (err: any) {
    console.error('[bd_leads_api] GET failed:', err)
    return NextResponse.json({ error: 'Internal Server Error', details: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify role: BD or ADMIN
  const userRoles = await prisma.userBusinessRole.findMany({
    where: { userId: session.user.id },
    select: { role: true }
  })
  const roles = userRoles.map((r: { role: string }) => r.role)
  const isBD = roles.includes('BD')
  const isAdmin = session.user.role === 'ADMIN'

  if (!isBD && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { name, phone, email, notes } = body

    if (!name) {
      return NextResponse.json({ error: 'Restaurant/Contact Name is required' }, { status: 400 })
    }

    const lead = await prisma.salesLead.create({
      data: {
        bdUserId: session.user.id,
        name,
        phone: phone || null,
        email: email || null,
        notes: notes || null,
        status: 'NEW'
      }
    })

    return NextResponse.json({ lead }, { status: 201 })
  } catch (err: any) {
    console.error('[bd_leads_api] POST failed:', err)
    return NextResponse.json({ error: 'Internal Server Error', details: String(err) }, { status: 500 })
  }
}
