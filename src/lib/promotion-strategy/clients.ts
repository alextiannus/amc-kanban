import { growthPlanningRequest, type PlanningActor } from '@/lib/growthPlanning'

const isLocal = process.env.NODE_ENV !== 'production' && process.env.RENDER !== 'true'

export async function fetchPromotionStrategyMarketCalendar(input: {
  markets?: string[]
  year?: string | number
  merchantCategory?: string
}, actor: PlanningActor) {
  const params = new URLSearchParams()
  for (const market of input.markets || []) params.append('market', market)
  if (input.year) params.set('year', String(input.year))
  if (input.merchantCategory) params.set('merchantCategory', input.merchantCategory)
  return growthPlanningRequest<{
    ok?: boolean
    error?: string
    events?: Array<Record<string, unknown>>
    contentLibraryGaps?: Array<Record<string, unknown>>
  }>(`/v1/market-calendar?${params.toString()}`, { method: 'GET' }, actor)
}

export async function matchPromotionStrategyCreativeCandidates(input: unknown) {
  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/$/, '') || (isLocal ? 'http://localhost:4010' : '')
  if (!baseUrl) throw new Error('amc_content_service_not_configured')
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim() || (isLocal ? 'local-service-token' : '')
  const response = await fetch(`${baseUrl}/v1/content-library/match-promotion-point-creatives`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
  })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || `promotion_strategy_creative_match_failed:${response.status}`)
  return data as {
    contentMatchRequestId: string
    libraryVersions: Record<string, unknown>
    creativeCandidates: Array<Record<string, unknown>>
    contentLibraryGaps: Array<Record<string, unknown>>
    candidateAssetNeeds: Array<Record<string, unknown>>
    candidateStoreVisitNeeds: Array<Record<string, unknown>>
    candidateMaterialPrintNeeds: Array<Record<string, unknown>>
  }
}

export async function matchPromotionStrategyCreativeBatch(input: unknown) {
  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/$/, '') || (isLocal ? 'http://localhost:4010' : '')
  if (!baseUrl) throw new Error('amc_content_service_not_configured')
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim() || (isLocal ? 'local-service-token' : '')
  const response = await fetch(`${baseUrl}/v1/content-library/match-promotion-point-creative-batch`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
  })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || `promotion_strategy_creative_batch_failed:${response.status}`)
  return data as {
    contentMatchRequestId: string
    libraryVersions: Record<string, unknown>
    matches: Array<Record<string, unknown>>
    creativeCandidates: Array<Record<string, unknown>>
    contentLibraryGaps: Array<Record<string, unknown>>
    candidateAssetNeeds: Array<Record<string, unknown>>
    candidateStoreVisitNeeds: Array<Record<string, unknown>>
    candidateMaterialPrintNeeds: Array<Record<string, unknown>>
  }
}
