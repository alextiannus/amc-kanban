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
    const expiryLimit = new Date()
    expiryLimit.setDate(expiryLimit.getDate() - 90)

    const dbLeads = await prisma.salesLead.findMany({
      where: { 
        bdUserId: session.user.id,
        status: { not: 'ONBOARDED' },
        createdAt: { gte: expiryLimit }
      },
      orderBy: { createdAt: 'desc' }
    })

    const leads = dbLeads.map((lead: any) => {
      const daysActive = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      return {
        ...lead,
        daysActive,
        daysToExpiry: 90 - daysActive
      }
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

    // Validate duplicates if phone or email is provided
    if (phone && phone.trim()) {
      const trimmedPhone = phone.trim()
      // Check in SalesLead
      const dupLeadPhone = await prisma.salesLead.findFirst({
        where: { phone: trimmedPhone }
      })
      if (dupLeadPhone) {
        return NextResponse.json({ error: '此客户电话号码已被系统录入，请勿重复跟进。' }, { status: 409 })
      }
    }

    if (email && email.trim()) {
      const trimmedEmail = email.trim().toLowerCase()
      // Check in SalesLead
      const dupLeadEmail = await prisma.salesLead.findFirst({
        where: { email: { equals: trimmedEmail, mode: 'insensitive' } }
      })
      if (dupLeadEmail) {
        return NextResponse.json({ error: '此客户邮箱地址已被系统录入，请勿重复跟进。' }, { status: 409 })
      }
      
      // Check in User
      const dupUser = await prisma.user.findFirst({
        where: { email: { equals: trimmedEmail, mode: 'insensitive' } }
      })
      if (dupUser) {
        return NextResponse.json({ error: '此客户邮箱已被商户注册，请勿重复跟进。' }, { status: 409 })
      }
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

export async function PATCH(req: NextRequest) {
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
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing required parameters: id, status' }, { status: 400 })
    }

    // Verify lead ownership (Admins can bypass)
    const existingLead = await prisma.salesLead.findUnique({
      where: { id }
    })

    if (!existingLead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (existingLead.bdUserId !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden: You do not own this lead' }, { status: 403 })
    }

    const updated = await prisma.salesLead.update({
      where: { id },
      data: { status }
    })

    return NextResponse.json({ lead: updated })
  } catch (err: any) {
    console.error('[bd_leads_api] PATCH failed:', err)
    return NextResponse.json({ error: 'Internal Server Error', details: String(err) }, { status: 500 })
  }
}
