import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendContactUsTrialInviteEmail } from '@/lib/email'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SOURCE = 'amc-official-website-contact-us'
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 8
const ipSubmissions = new Map<string, number[]>()

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-amc-client-ip') || req.headers.get('x-forwarded-for') || ''
  return truncate(forwarded.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '', 128)
}

function isRateLimited(key: string, now = Date.now()): boolean {
  if (!key) return false
  const recent = (ipSubmissions.get(key) || []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    ipSubmissions.set(key, recent)
    return true
  }
  recent.push(now)
  ipSubmissions.set(key, recent)
  return false
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

    const input = body as Record<string, unknown>

    if (text(input.company)) {
      return NextResponse.json({ ok: true, accepted: true })
    }

    const brandName = truncate(text(input.brandName), 160)
    const market = truncate(text(input.market), 120)
    const category = truncate(text(input.category), 120)
    const contactName = truncate(text(input.contactName), 120)
    const email = truncate(text(input.email).toLowerCase(), 180)
    const phone = truncate(text(input.phone), 80)
    const mainConcern = truncate(text(input.mainConcern), 2000)
    const preferredLanguage = text(input.preferredLanguage).toLowerCase() === 'en' ? 'en' : 'zh'

    const missing = [
      ['brandName', brandName],
      ['market', market],
      ['category', category],
      ['contactName', contactName],
      ['email', email],
    ].filter(([, value]) => !value).map(([key]) => key)

    if (missing.length > 0) {
      return NextResponse.json({ error: 'Missing required fields', fields: missing }, { status: 400 })
    }

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    if (!Boolean(input.consent)) {
      return NextResponse.json({ error: 'Consent is required' }, { status: 400 })
    }

    const ipAddress = getIp(req)
    if (isRateLimited(ipAddress || email)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const notes = [
      `Source: ${SOURCE}`,
      `Contact: ${contactName}`,
      `Market: ${market}`,
      `Category: ${category}`,
      phone ? `Phone: ${phone}` : '',
      mainConcern ? `Message: ${mainConcern}` : '',
      `Preferred language: ${preferredLanguage}`,
    ].filter(Boolean).join('\n')

    const db = prisma as any
    const existingLead = await db.salesLead.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        notes: { contains: `Source: ${SOURCE}` },
      },
      orderBy: { createdAt: 'desc' },
    })
    const lead = existingLead
      ? await db.salesLead.update({
          where: { id: existingLead.id },
          data: {
            name: brandName,
            phone: phone || existingLead.phone,
            notes,
            status: existingLead.status === 'ONBOARDED' ? existingLead.status : 'NEW',
          },
        })
      : await db.salesLead.create({
          data: {
            bdUserId: null,
            name: brandName,
            phone: phone || null,
            email,
            notes,
            status: 'NEW',
          },
        })

    const shouldSendEmail = !existingLead || Date.now() - new Date(existingLead.updatedAt).getTime() > 24 * 60 * 60 * 1000
    const emailResult = shouldSendEmail
      ? await sendContactUsTrialInviteEmail({
          to: email,
          nickname: contactName,
          trialLink: 'https://amc-mm.immedi.ai',
          appUrl: 'https://amc-mm.immedi.ai',
          senderName: 'AMC Team',
        })
      : { success: false, error: 'Duplicate submission within 24 hours' }

    if (emailResult.success && emailResult.messageId) {
      await db.salesLead.update({
        where: { id: lead.id },
        data: {
          notes: `${notes}\nEmail message ID: ${emailResult.messageId}`,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      accepted: true,
      leadId: lead.id,
      reused: Boolean(existingLead),
      emailSent: emailResult.success,
      emailMessageId: emailResult.success ? emailResult.messageId || null : null,
      emailError: emailResult.success ? null : emailResult.error || 'Email send failed',
    }, { status: existingLead ? 200 : 201 })
  } catch (err: any) {
    console.error('[public_contact_us] POST failed:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
