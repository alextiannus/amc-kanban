/**
 * Brand Context Builder
 *
 * Unified function that generates a structured brand context string from the
 * 4 modules of BrandKnowledge + Brand base info. This is used by the Copywriter
 * agent instead of scattered inline context assembly.
 *
 * Sections:
 *   1. Brand Story     — description, audience, sell points, tone, voice
 *   2. Business Info   — address, hours, reservation/order links
 *   3. Knowledge Base  — market, district, competitors, menu, slang, neg-prompts
 *   4. Promo Plan      — current period direction, copy requirements, brand image
 */

import { prisma } from './prisma'

export interface PromoPlan {
  period?: 'monthly' | 'weekly' | 'biannual' | string
  startDate?: string
  endDate?: string
  direction?: string
  copywritingRequirements?: string
  brandVoice?: string
  brandImage?: string
  keyMessages?: string[]
  campaigns?: Array<{ name: string; dates?: string; desc?: string }>
}

export interface PublishingFreq {
  postsPerDay?: number
  platforms?: Record<string, {
    postsPerDay?: number
    postsPerWeek?: number
    preferredHours?: number[]
  }>
}

export interface BrandContextResult {
  contextText: string
  promoPlan: PromoPlan | null
  publishingFreq: PublishingFreq | null
  brandTone: string
  market: string
  district: string
}

export async function buildBrandContext(brandId: string): Promise<BrandContextResult> {
  const [brand, knowledge] = await Promise.all([
    prisma.brand.findUnique({
      where: { id: brandId },
      select: {
        name: true,
        description: true,
        location: true,
        address: true,
        website: true,
        phone: true,
        timezone: true,
      },
    }),
    prisma.brandKnowledge.findUnique({ where: { brandId } }),
  ])

  if (!brand) return { contextText: '', promoPlan: null, publishingFreq: null, brandTone: '', market: '', district: '' }

  const k = knowledge as any
  const lines: string[] = []

  // ── Section 1: Brand Story ────────────────────────────────────────────────
  lines.push(`## Brand: ${brand.name}`)
  if (brand.description) lines.push(`Description: ${brand.description}`)
  if (k?.audienceAssumptions) lines.push(`Target Audience: ${k.audienceAssumptions}`)
  if (k?.productAssumptions) lines.push(`Key Selling Points: ${k.productAssumptions}`)
  if (k?.brandTone) lines.push(`Brand Tone/Voice: ${k.brandTone}`)

  // ── Section 2: Business Info ──────────────────────────────────────────────
  const bizLines: string[] = []
  if (brand.address) bizLines.push(`Address: ${brand.address}`)
  if (brand.location) bizLines.push(`Area: ${brand.location}`)
  if (brand.phone) bizLines.push(`Phone: ${brand.phone}`)
  if (brand.website) bizLines.push(`Website: ${brand.website}`)
  if (k?.reservationUrl) bizLines.push(`Reservation: ${k.reservationUrl}`)
  if (k?.orderingUrl) bizLines.push(`Online Order: ${k.orderingUrl}`)
  if (k?.businessHours) {
    const hours = k.businessHours
    if (typeof hours === 'string') bizLines.push(`Business Hours: ${hours}`)
    else if (Array.isArray(hours)) {
      bizLines.push(`Business Hours:\n` + hours.map((h: any) => `  ${h.day}: ${h.open}–${h.close}`).join('\n'))
    }
  }
  if (k?.deliveryUrls && Array.isArray(k.deliveryUrls) && k.deliveryUrls.length > 0) {
    bizLines.push(`Delivery Platforms: ${k.deliveryUrls.map((d: any) => d.platform).join(', ')}`)
  }
  if (bizLines.length > 0) {
    lines.push('\n## Business Information')
    lines.push(...bizLines)
  }

  // ── Section 3: Knowledge Base ─────────────────────────────────────────────
  const kbLines: string[] = []
  if (k?.market) kbLines.push(`Market: ${k.market}`)
  if (k?.district) kbLines.push(`District/Area: ${k.district}`)
  if (k?.competitors && Array.isArray(k.competitors) && k.competitors.length > 0) {
    kbLines.push(`Competitors: ${k.competitors.join(', ')}`)
  }
  if (k?.menuItems && Array.isArray(k.menuItems) && k.menuItems.length > 0) {
    const menuText = k.menuItems
      .slice(0, 15) // cap at 15 items to avoid prompt bloat
      .map((item: any) => `  - ${item.name}${item.price ? ` ($${item.price})` : ''}${item.description ? `: ${item.description}` : ''}`)
      .join('\n')
    kbLines.push(`Menu Highlights:\n${menuText}`)
  }
  if (k?.slangDict && Object.keys(k.slangDict).length > 0) {
    kbLines.push(`Local Terminology:\n` + Object.entries(k.slangDict).map(([key, val]) => `  "${key}" → ${val}`).join('\n'))
  }
  if (k?.negPrompts && Array.isArray(k.negPrompts) && k.negPrompts.length > 0) {
    kbLines.push(`NEVER use: ${k.negPrompts.map((w: string) => `"${w}"`).join(', ')}`)
  }
  if (kbLines.length > 0) {
    lines.push('\n## Knowledge Base')
    lines.push(...kbLines)
  }

  // ── Section 4: Promotion Plan ─────────────────────────────────────────────
  const promoPlan = k?.promoPlan as PromoPlan | null ?? null
  if (promoPlan) {
    lines.push('\n## Current Promotion Plan')
    if (promoPlan.period) {
      const periodLabel = { monthly: '月度', weekly: '周度', biannual: '半年度' }[promoPlan.period] ?? promoPlan.period
      lines.push(`Period: ${periodLabel}${promoPlan.startDate ? ` (${promoPlan.startDate} ~ ${promoPlan.endDate ?? '?'})` : ''}`)
    }
    if (promoPlan.direction) lines.push(`Promotion Direction: ${promoPlan.direction}`)
    if (promoPlan.copywritingRequirements) lines.push(`Copywriting Requirements: ${promoPlan.copywritingRequirements}`)
    if (promoPlan.brandVoice) lines.push(`Brand Voice: ${promoPlan.brandVoice}`)
    if (promoPlan.brandImage) lines.push(`Brand Image: ${promoPlan.brandImage}`)
    if (promoPlan.keyMessages && promoPlan.keyMessages.length > 0) {
      lines.push(`Key Messages:\n` + promoPlan.keyMessages.map((m) => `  • ${m}`).join('\n'))
    }
    if (promoPlan.campaigns && promoPlan.campaigns.length > 0) {
      lines.push(`Active Campaigns:\n` + promoPlan.campaigns.map((c) => `  • ${c.name}${c.dates ? ` [${c.dates}]` : ''}: ${c.desc ?? ''}`).join('\n'))
    }
  }

  return {
    contextText: lines.join('\n'),
    promoPlan,
    publishingFreq: k?.publishingFreq as PublishingFreq | null ?? null,
    brandTone: k?.brandTone || '',
    market: k?.market || '',
    district: k?.district || '',
  }
}
