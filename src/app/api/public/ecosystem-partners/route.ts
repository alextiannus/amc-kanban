import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AGREEMENT_VERSION = 'amc-ecosystem-partner-v1.0'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for') || ''
  return truncate(forwarded.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '', 128)
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Hidden honeypot field used by the public website form.
    if (text((body as any).company)) {
      return NextResponse.json({ ok: true, accepted: true })
    }

    const name = truncate(text((body as any).name), 120)
    const city = truncate(text((body as any).city), 120)
    const email = truncate(text((body as any).email).toLowerCase(), 180)
    const phone = truncate(text((body as any).phone), 80)
    const agreementVersion = truncate(text((body as any).agreementVersion) || AGREEMENT_VERSION, 80)
    const services = Array.isArray((body as any).services)
      ? (body as any).services.map((item: unknown) => truncate(text(item), 80)).filter(Boolean).slice(0, 20)
      : []

    const missing = [
      ['name', name],
      ['city', city],
      ['email', email],
    ].filter(([, value]) => !value).map(([key]) => key)

    if (missing.length > 0) {
      return NextResponse.json({ error: 'Missing required fields', fields: missing }, { status: 400 })
    }

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    if (!Boolean((body as any).agreementAccepted)) {
      return NextResponse.json({ error: 'Agreement acceptance is required' }, { status: 400 })
    }

    const userAgent = truncate(req.headers.get('user-agent') || '', 500)
    const ipAddress = getIp(req)

    const db = prisma as any
    const application = await db.ecosystemPartnerApplication.upsert({
      where: { email },
      update: {
        name,
        city,
        phone: phone || null,
        agreementVersion,
        services,
        source: 'amc-official-website',
        status: 'NEW',
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        submittedAt: new Date(),
      },
      create: {
        name,
        city,
        email,
        phone: phone || null,
        agreementVersion,
        services,
        source: 'amc-official-website',
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    })

    return NextResponse.json({
      ok: true,
      accepted: true,
      applicationId: application.id,
      status: application.status,
    }, { status: 201 })
  } catch (err: any) {
    console.error('[ecosystem_partner_application] POST failed:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
