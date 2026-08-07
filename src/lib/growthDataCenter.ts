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

export class GrowthDataCenterError extends Error {
  status: number
  code: string

  constructor(status: number, code: string) {
    super(code)
    this.name = 'GrowthDataCenterError'
    this.status = status
    this.code = code
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
  const merchantPath = `/v1/merchants/${encodeURIComponent(brandKey)}`
  const [profileResponse, knowledgeResponse, brandStoryResponse, growthPlanResponse, contentBriefsResponse, merchant360Response] = await Promise.all([
    growthRequest(`${merchantPath}/profile`, { method: 'GET' }),
    growthRequest(`${merchantPath}/knowledge`, { method: 'GET' }),
    growthRequest(`${merchantPath}/brand-story`, { method: 'GET' }),
    growthRequest(`${merchantPath}/growth-plan`, { method: 'GET' }),
    growthRequest(`${merchantPath}/content-briefs`, { method: 'GET' }),
    growthRequest(`/v1/internal/merchants/${encodeURIComponent(brandKey)}/360`, { method: 'GET' }),
  ])
  if (!profileResponse.ok) {
    throw new Error(`growth_merchant_profile_read_failed:${profileResponse.status}`)
  }
  if (!knowledgeResponse.ok) {
    throw new Error(`growth_merchant_knowledge_read_failed:${knowledgeResponse.status}`)
  }
  if (!merchant360Response.ok) {
    throw new Error(`growth_merchant_360_read_failed:${merchant360Response.status}`)
  }
  const optionalStatus = {
    knowledge: knowledgeResponse.status,
    brandStory: brandStoryResponse.status,
    growthPlan: growthPlanResponse.status,
    contentBriefs: contentBriefsResponse.status,
    merchant360: merchant360Response.status,
  }
  return {
    profile: await profileResponse.json(),
    knowledge: knowledgeResponse.ok ? await knowledgeResponse.json() : { items: [] },
    brandStory: brandStoryResponse.ok ? await brandStoryResponse.json() : null,
    growthPlan: growthPlanResponse.ok ? await growthPlanResponse.json() : null,
    contentBriefs: contentBriefsResponse.ok ? await contentBriefsResponse.json() : null,
    merchant360: await merchant360Response.json(),
    resourceStatus: optionalStatus,
  }
}

export async function readGrowthMerchantKnowledge(brandKey: string) {
  const response = await growthRequest(
    `/v1/merchants/${encodeURIComponent(brandKey)}/knowledge`,
    { method: 'GET' }
  )
  if (!response.ok) {
    throw new Error(`growth_merchant_knowledge_read_failed:${response.status}`)
  }
  return response.json() as Promise<{ items?: Array<Record<string, unknown>> }>
}

export async function publishGrowthMerchantKnowledgeRevision(input: {
  brandKey: string
  knowledgeKey: 'brand.tone' | 'audience.primary' | 'brand.unique_selling_points'
  expectedVersion: number
  statement: string
  structuredValue: unknown
  actor: {
    id: string
    email?: string | null
    type?: string | null
    roles?: string[]
  }
}) {
  const response = await growthRequest(
    `/v1/internal/merchants/${encodeURIComponent(input.brandKey)}/knowledge/${encodeURIComponent(input.knowledgeKey)}`,
    {
      method: 'PUT',
      headers: {
        'x-amc-actor-id': input.actor.id,
        'x-amc-actor-email': input.actor.email || '',
        'x-amc-actor-type': input.actor.type || 'HUMAN',
        'x-amc-actor-roles': (input.actor.roles || []).join(','),
      },
      body: JSON.stringify({
        expected_version: input.expectedVersion,
        statement: input.statement,
        structured_value: input.structuredValue,
        note: 'Kanban 品牌定位逐行编辑',
      }),
    }
  )
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    throw new GrowthDataCenterError(
      response.status,
      typeof payload.error === 'string' ? payload.error : `growth_knowledge_publish_failed:${response.status}`
    )
  }
  return payload
}
