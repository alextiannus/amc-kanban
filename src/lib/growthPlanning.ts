const isLocal = process.env.NODE_ENV !== 'production' && process.env.RENDER !== 'true'

function growthBaseUrl() {
  return (process.env.AMC_GROWTH_API_URL || (isLocal ? 'http://localhost:4188' : 'https://amc-growth.onrender.com')).replace(/\/$/, '')
}

function growthToken() {
  return process.env.AMC_KNOWLEDGE_TOKEN || process.env.AMC_GROWTH_TOKEN || ''
}

export type PlanningActor = { userId: string; email?: string | null; roles: string[] }

export async function growthPlanningRequest<T>(path: string, init: RequestInit, actor: PlanningActor): Promise<T> {
  const token = growthToken()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)
  try {
    const response = await fetch(`${growthBaseUrl()}${path}`, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'x-amc-actor-id': actor.userId,
        'x-amc-actor-email': actor.email || '',
        'x-amc-actor-roles': actor.roles.join(','),
        'x-amc-actor-type': 'HUMAN',
        ...(init.headers || {}),
      },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(data.error || data.message || `growth_planning_failed:${response.status}`) as Error & { status?: number; data?: unknown }
      error.status = response.status
      error.data = data
      throw error
    }
    return data as T
  } finally {
    clearTimeout(timeout)
  }
}

export async function generateRemoteMaterialPlans(input: unknown) {
  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/$/, '') || (isLocal ? 'http://localhost:4010' : '')
  if (!baseUrl) throw new Error('amc_content_service_not_configured')
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim() || (isLocal ? 'local-service-token' : '')
  const response = await fetch(`${baseUrl}/v1/internal/material-plans/generate`, {
    method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(input),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `material_plan_generation_failed:${response.status}`)
  return data as { items: Array<{ planItemId: string; requirements: Array<Record<string, unknown>> }>; generation: Record<string, unknown> }
}
