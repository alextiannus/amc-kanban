import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'

type GrowthLinkedBrand = {
  id: string
  name: string
  location?: string | null
  address?: string | null
  description?: string | null
  growthBrandKey?: string | null
}

function growthBaseUrl() {
  const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
  return (process.env.AMC_GROWTH_API_URL || (isProd
    ? 'https://amc-growth.onrender.com'
    : 'http://localhost:4188')).replace(/\/$/, '')
}

function growthHeaders() {
  const token = process.env.AMC_KNOWLEDGE_TOKEN || process.env.AMC_GROWTH_TOKEN || ''
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
}

async function growthRequest(path: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    return await fetch(`${growthBaseUrl()}${path}`, {
      ...init,
      headers: { ...growthHeaders(), ...(init.headers || {}) },
      cache: 'no-store',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function ensureGrowthMerchantForBrand(brand: GrowthLinkedBrand) {
  const response = await growthRequest('/v1/internal/merchants/upsert', {
    method: 'POST',
    body: JSON.stringify({
      source_system: 'amc-kanban',
      external_id: brand.id,
      canonical_name: brand.name,
      market: brand.location || null,
      category: brand.description || null,
      metadata: {
        kanban_brand_id: brand.id,
        address: brand.address || null,
      },
    }),
  })
  if (!response.ok) {
    throw new Error(`growth_merchant_upsert_failed:${response.status}`)
  }
  const merchant = await response.json() as { brand_key?: string }
  if (!merchant.brand_key) throw new Error('growth_merchant_upsert_missing_brand_key')
  if (brand.growthBrandKey !== merchant.brand_key) {
    await prisma.brand.update({
      where: { id: brand.id },
      data: { growthBrandKey: merchant.brand_key },
    })
  }
  return merchant.brand_key
}

export async function ensureGrowthMerchantByBrandId(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      name: true,
      location: true,
      address: true,
      description: true,
      growthBrandKey: true,
    },
  })
  if (!brand) throw new Error('brand_not_found')
  return ensureGrowthMerchantForBrand(brand)
}

export async function publishGrowthMerchantEvent(input: {
  brandId: string
  eventType: string
  payload?: Record<string, unknown>
  occurredAt?: Date
}) {
  const brand = await prisma.brand.findUnique({
    where: { id: input.brandId },
    select: {
      id: true,
      name: true,
      location: true,
      address: true,
      description: true,
      growthBrandKey: true,
    },
  })
  if (!brand) throw new Error('brand_not_found')
  const brandKey = brand.growthBrandKey || await ensureGrowthMerchantForBrand(brand)
  const response = await growthRequest('/v1/internal/merchant-events', {
    method: 'POST',
    body: JSON.stringify({
      event_id: randomUUID(),
      event_type: input.eventType,
      producer: 'amc-kanban',
      brand_key: brandKey,
      occurred_at: (input.occurredAt || new Date()).toISOString(),
      payload: input.payload || {},
    }),
  })
  if (!response.ok) throw new Error(`growth_merchant_event_failed:${response.status}`)
  return response.json()
}

export async function readGrowthMerchantData(brandKey: string) {
  const [profileResponse, knowledgeResponse] = await Promise.all([
    growthRequest(`/v1/merchants/${encodeURIComponent(brandKey)}/profile`, { method: 'GET' }),
    growthRequest(`/v1/merchants/${encodeURIComponent(brandKey)}/knowledge`, { method: 'GET' }),
  ])
  if (!profileResponse.ok || !knowledgeResponse.ok) {
    throw new Error(`growth_merchant_read_failed:${profileResponse.status}:${knowledgeResponse.status}`)
  }
  return {
    profile: await profileResponse.json(),
    knowledge: await knowledgeResponse.json(),
  }
}
