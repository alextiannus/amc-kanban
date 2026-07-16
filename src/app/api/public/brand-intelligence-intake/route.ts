import { NextRequest, NextResponse } from 'next/server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveGrowthUrl(): string {
  return (process.env.AMC_GROWTH_API_URL || 'https://amc-growth.immedi.ai').replace(/\/$/, '')
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

    // Hidden honeypot field from the public website form.
    if (text((body as any).company)) {
      return NextResponse.json({ ok: true, accepted: true })
    }

    const payload = {
      brand_name: text((body as any).brandName ?? (body as any).brand_name),
      market: text((body as any).market),
      category: text((body as any).category),
      contact_name: text((body as any).contactName ?? (body as any).contact_name),
      email: text((body as any).email).toLowerCase(),
      website_url: text((body as any).websiteUrl ?? (body as any).website_url),
      google_maps_url: text((body as any).googleMapsUrl ?? (body as any).google_maps_url),
      instagram_url: text((body as any).instagramUrl ?? (body as any).instagram_url),
      facebook_url: text((body as any).facebookUrl ?? (body as any).facebook_url),
      tiktok_url: text((body as any).tiktokUrl ?? (body as any).tiktok_url),
      other_links: text((body as any).otherLinks ?? (body as any).other_links),
      main_concern: text((body as any).mainConcern ?? (body as any).main_concern),
      source: 'amc-official-website',
      force_refresh: Boolean((body as any).forceRefresh ?? (body as any).force_refresh),
    }

    const missing = [
      ['brandName', payload.brand_name],
      ['market', payload.market],
      ['category', payload.category],
      ['contactName', payload.contact_name],
      ['email', payload.email],
    ].filter(([, value]) => !value).map(([key]) => key)

    if (missing.length > 0) {
      return NextResponse.json({ error: 'Missing required fields', fields: missing }, { status: 400 })
    }

    if (!EMAIL_RE.test(payload.email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    if (!Boolean((body as any).consent)) {
      return NextResponse.json({ error: 'Consent is required' }, { status: 400 })
    }

    const headers: Record<string, string> = { 'content-type': 'application/json' }
    const token = process.env.AMC_GROWTH_TOKEN
    if (token) headers.authorization = `Bearer ${token}`

    const upstream = await fetch(`${resolveGrowthUrl()}/v1/brand-intelligence-intake`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    })

    const data = await upstream.json().catch(() => ({}))
    if (!upstream.ok) {
      return NextResponse.json({
        error: data.error || 'Brand intelligence intake failed',
        details: data,
      }, { status: upstream.status })
    }

    return NextResponse.json({
      ok: true,
      accepted: true,
      reused: Boolean(data.reused),
      freshnessDays: data.freshness_days ?? 60,
      brandKey: data.brand_key,
      reportPath: data.report_path,
      evidencePath: data.evidence_path,
      freshUntil: data.fresh_until,
    }, { status: upstream.status === 201 ? 201 : 200 })
  } catch (err: any) {
    console.error('[brand_intelligence_intake] POST failed:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
