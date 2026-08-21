/**
 * Brand Context Builder
 *
 * Unified function that generates a structured brand context string from the
 * 4 modules of BrandKnowledge + Brand base info. This is used by the Copywriter
 * agent instead of scattered inline context assembly.
 *
 * Sections:
 *   1. Brand Plan      — description, audience, sell points, tone, voice
 *   2. Business Info   — address, hours, reservation/order links
 *   3. Knowledge Base  — market, district, competitors, menu, slang, neg-prompts
 *   4. Creative Identity — evergreen local voice, visual identity, promotion focus
 */

import { prisma } from './prisma'
import { resolveBrandIdentity } from './brandIdentity'

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
  publishingFreq: PublishingFreq | null
  brandTone: string
  audience: string
  sellingPoints: string[]
  market: string
  district: string
}

export async function buildBrandContext(brandId: string): Promise<BrandContextResult> {
  const [brand, knowledge, identity] = await Promise.all([
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
    resolveBrandIdentity(brandId),
  ])

  if (!brand) return { contextText: '', publishingFreq: null, brandTone: '', audience: '', sellingPoints: [], market: '', district: '' }

  const k = knowledge as any
  const brandTone = String(identity?.fields.brandTone.value || k?.brandTone || '')
  const audience = String(identity?.fields.targetAudience.value || k?.audienceAssumptions || '')
  const sellingPoints = Array.isArray(identity?.fields.sellingPoints.value)
    ? identity.fields.sellingPoints.value
    : (k?.productAssumptions ? [String(k.productAssumptions)] : [])
  const lines: string[] = []

  // ── Section 1: Brand Plan ─────────────────────────────────────────────────
  lines.push(`## Brand: ${brand.name}`)
  if (brand.description) lines.push(`Description: ${brand.description}`)
  if (audience) lines.push(`Target Audience: ${audience}`)
  if (sellingPoints.length) lines.push(`Key Selling Points: ${sellingPoints.join('; ')}`)
  if (brandTone) lines.push(`Brand Tone/Voice: ${brandTone}`)

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

  // ── Section 4: Creative Identity ──────────────────────────────────────────
  const brandVoice = String(identity?.fields.brandVoice.value || k?.brandVoice || '')
  const brandImage = String(identity?.fields.brandImage.value || k?.brandImage || '')
  const promotionFocus = String(identity?.fields.promotionFocus.value || k?.promotionFocus || '')
  if (brandVoice || brandImage || promotionFocus) {
    lines.push('\n## Creative Identity')
    if (brandVoice) lines.push(`Brand Voice: ${brandVoice}`)
    if (brandImage) lines.push(`Brand Image: ${brandImage}`)
    if (promotionFocus) lines.push(`Evergreen Promotion Focus: ${promotionFocus}`)
  }

  return {
    contextText: lines.join('\n'),
    publishingFreq: k?.publishingFreq as PublishingFreq | null ?? null,
    brandTone,
    audience,
    sellingPoints,
    market: k?.market || '',
    district: k?.district || '',
  }
}
