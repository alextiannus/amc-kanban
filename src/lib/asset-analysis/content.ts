export type AssetAnalysisContentConfig = { baseUrl: string; token: string }

export function assetAnalysisContentConfig(): AssetAnalysisContentConfig {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')
  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.trim().replace(/\/+$/, '') || (isLocal ? 'http://localhost:4010' : '')
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim() || (isLocal ? 'local-service-token' : '')
  if (!baseUrl || !token || process.env.AMC_CONTENT_REMOTE_ENABLED === 'false') throw new Error('AMC Content service connection is not configured for image analysis')
  return { baseUrl, token }
}

export async function analysisContent(config: AssetAnalysisContentConfig, path: string, payload?: unknown) {
  let endpoint: string
  if (path === '/v1/capabilities' && payload === undefined) endpoint = '/v1/asset-analysis/capabilities'
  else if (path === '/v1/jobs' && payload !== undefined) endpoint = '/v1/asset-analysis/jobs'
  else if (/^\/v1\/jobs\/[^/]+$/.test(path) && payload === undefined) endpoint = `/v1/asset-analysis/jobs?jobId=${encodeURIComponent(decodeURIComponent(path.slice('/v1/jobs/'.length)))}`
  else throw new Error('Unsupported image analysis operation')
  const response = await fetch(config.baseUrl + endpoint, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    cache: 'no-store', signal: AbortSignal.timeout(30_000),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(typeof data?.error === 'string' ? data.error : `AMC Content image analysis unavailable (${response.status})`)
  return data
}
