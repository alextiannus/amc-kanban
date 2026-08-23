import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'

type GrowthLinkedBrand = {
  id: string
  name: string
  location?: string | null
  address?: string | null
  description?: string | null
  industry?: string | null
  growthBrandKey?: string | null
  owners?: Array<{ role?: string | null; user?: { email?: string | null; nickname?: string | null } | null }>
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
  const timeout = setTimeout(() => controller.abort(), 15000)
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

export type GrowthMerchantSnapshotConflict = {
  path: string
  code: string
  kanban_value: unknown
  growth_value: unknown
  last_applied_value: unknown
}

export type GrowthMerchantSnapshotResponse = {
  ok: boolean
  status: 'synced' | 'partial' | 'conflict'
  source_system: string
  external_id: string
  brand_key: string
  source_version: number
  applied_paths: string[]
  unchanged_paths: string[]
  skipped_paths: string[]
  conflicts: GrowthMerchantSnapshotConflict[]
  locations: Array<{ store_id: string; location_key: string }>
}

export async function publishGrowthMerchantSnapshot(input: {
  brandId: string
  payload: Record<string, unknown>
  actor?: {
    id?: string | null
    email?: string | null
    type?: string | null
    roles?: string[]
  }
}) {
  const response = await growthRequest(
    `/v1/internal/merchant-snapshots/amc-kanban/${encodeURIComponent(input.brandId)}`,
    {
      method: 'PUT',
      headers: {
        'x-amc-actor-id': input.actor?.id || '',
        'x-amc-actor-email': input.actor?.email || '',
        'x-amc-actor-type': input.actor?.type || 'SYSTEM',
        'x-amc-actor-roles': (input.actor?.roles || []).join(','),
      },
      body: JSON.stringify(input.payload),
    }
  )
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    throw new GrowthDataCenterError(
      response.status,
      typeof payload.error === 'string'
        ? payload.error
        : `growth_snapshot_publish_failed:${response.status}`
    )
  }
  return payload as GrowthMerchantSnapshotResponse
}

export async function ensureGrowthMerchantForBrand(brand: GrowthLinkedBrand) {
  const response = await growthRequest('/v1/internal/merchants/upsert', {
    method: 'POST',
    body: JSON.stringify({
      source_system: 'amc-kanban',
      external_id: brand.id,
      canonical_name: brand.name,
      market: brand.location || null,
      category: brand.industry || null,
      metadata: {
        kanban_brand_id: brand.id,
        address: brand.address || null,
      },
    }),
  })
  const merchant = await response.json().catch(() => ({})) as { brand_key?: string; error?: string }
  if (!response.ok) {
    throw new GrowthDataCenterError(
      response.status,
      merchant.error || `growth_merchant_upsert_failed:${response.status}`
    )
  }
  if (!merchant.brand_key) throw new GrowthDataCenterError(502, 'growth_merchant_upsert_missing_brand_key')
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
      industry: true,
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
      industry: true,
      growthBrandKey: true,
    },
  })
  if (!brand) throw new Error('brand_not_found')
  const brandKey = await ensureGrowthMerchantForBrand(brand)
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

export type GrowthBrandIntelligenceJob = {
  ok?: boolean
  accepted?: boolean
  job_id?: string
  status?: string
  progress?: number
  market?: string | null
  category?: string | null
  result?: Record<string, unknown> | null
  report_versions?: Record<string, {
    report_version_id?: string
    tier?: string
    report_path?: string | null
    report_content?: string | null
    result?: Record<string, unknown> | null
    created_at?: string
  }>
  latest_report_tier?: string | null
  latest_report_path?: string | null
  latest_report_markdown?: string | null
  latest_report_content?: string | null
  latest_report_pdf_path?: string | null
  latest_report_pdf_download_path?: string | null
  initial_report_path?: string | null
  advanced_report_path?: string | null
  coverage_score?: number | null
  source_coverage?: Record<string, unknown>
  error?: unknown
}

export async function generateGrowthResearchReportForBrand(brand: GrowthLinkedBrand & {
  website?: string | null
  phone?: string | null
  googleBusinessUrl?: string | null
  googleReviewUrl?: string | null
  accounts?: Array<{ platformId: string; profileUrl?: string | null; handle?: string | null }>
}) {
  const owner = brand.owners?.find((item) => item.role === 'owner' && item.user?.email)?.user
    || brand.owners?.find((item) => item.user?.email)?.user
  const contactEmail = owner?.email || process.env.AMC_GROWTH_REPORT_EMAIL || 'contact@immedi.ai'
  const contactName = owner?.nickname || owner?.email?.split('@')[0] || 'AMC Kanban'
  const socialProfiles = Object.fromEntries((brand.accounts || [])
    .map((account) => [normalizeGrowthSocialPlatform(account.platformId), account.profileUrl || account.handle || ''])
    .filter(([platform, value]) => platform && value))
  const payload = {
    brand_name: brand.name,
    market: brand.location || brand.address || 'Singapore',
    category: brand.industry || 'Local merchant',
    contact_name: contactName,
    email: contactEmail,
    website_url: brand.website || '',
    google_maps_url: brand.googleBusinessUrl || brand.googleReviewUrl || '',
    instagram_url: socialProfiles.instagram || '',
    facebook_url: socialProfiles.facebook || '',
    tiktok_url: socialProfiles.tiktok || '',
    xiaohongshu_url: socialProfiles.xiaohongshu || '',
    main_concern: '生成品牌计划前的线上经营摸底调研报告。',
    report_tier: 'initial',
    generate_advanced: true,
    source: 'amc-kanban-brand-plan',
    force_refresh: true,
    external_evidence: {
      schema_version: 'amc.brand_intelligence.evidence.v1',
      collected_at: new Date().toISOString(),
      public_sources: [],
      collection_notes: [
        `AMC-Kanban brand_id=${brand.id}`,
        brand.description ? `品牌介绍：${brand.description}` : '',
        brand.address ? `门店地址：${brand.address}` : '',
        brand.phone ? `联系电话：${brand.phone}` : '',
      ].filter(Boolean),
    },
  }
  const createResponse = await growthRequest('/v1/brand-intelligence-intake', {
    method: 'POST',
    headers: {
      'idempotency-key': `amc-kanban-brand-plan:${brand.id}:${Date.now()}`,
    },
    body: JSON.stringify(payload),
  })
  const created = await createResponse.json().catch(() => ({})) as GrowthBrandIntelligenceJob
  if (!createResponse.ok) {
    throw new GrowthDataCenterError(createResponse.status, String((created as Record<string, unknown>).error || 'growth_research_create_failed'))
  }

  const jobId = created.job_id
  if (!jobId) throw new GrowthDataCenterError(502, 'growth_research_job_missing')

  const maxWaitMs = Math.max(30000, Number(process.env.AMC_GROWTH_REPORT_WAIT_MS || 240000))
  const pollIntervalMs = Math.max(2000, Number(process.env.AMC_GROWTH_REPORT_POLL_MS || 5000))
  const deadline = Date.now() + maxWaitMs
  let job: GrowthBrandIntelligenceJob = created
  while (Date.now() < deadline) {
    if (['completed', 'needs_review', 'failed', 'cancelled'].includes(String(job.status))) break
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    const statusResponse = await growthRequest(`/v1/brand-intelligence/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' })
    const statusPayload = await statusResponse.json().catch(() => ({})) as GrowthBrandIntelligenceJob
    if (!statusResponse.ok) {
      throw new GrowthDataCenterError(statusResponse.status, String((statusPayload as Record<string, unknown>).error || 'growth_research_status_failed'))
    }
    job = statusPayload
  }
  return job
}

function normalizeGrowthSocialPlatform(platformId: string) {
  const key = platformId.toLowerCase()
  if (key.includes('instagram')) return 'instagram'
  if (key.includes('tiktok')) return 'tiktok'
  if (key.includes('facebook') || key === 'fb') return 'facebook'
  if (key.includes('xiaohongshu') || key === 'xhs') return 'xiaohongshu'
  return ''
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
