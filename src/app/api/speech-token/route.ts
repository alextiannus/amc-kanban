import { NextResponse } from 'next/server'
import { getAzureSpeechConfig } from '@/lib/systemConfig'

/**
 * GET /api/speech-token
 *
 * Returns Azure Cognitive Services Speech temporary token for browser-side SDK use.
 * Token is fetched using the subscription key stored in SystemConfig (DB).
 *
 * Azure Speech tokens expire after 10 minutes.
 * Clients should refresh every 9 minutes.
 *
 * Server-side caches:
 * - Azure config from DB: cached 5 minutes (prevents repeated DB queries)
 * - Speech token from Azure: cached 9 minutes (prevents repeated Azure API calls)
 *
 * Response: { token: string; region: string }
 */
export const dynamic = 'force-dynamic'

// ── Server-side in-memory caches ───────────────────────────────────────────
type AzureConfig = { key: string; region: string }
let cachedConfig: AzureConfig | null = null
let configCacheExpiry = 0
const CONFIG_TTL_MS = 5 * 60 * 1000 // 5 minutes

let cachedToken: { token: string; region: string } | null = null
let tokenCacheExpiry = 0
const TOKEN_TTL_MS = 9 * 60 * 1000 // 9 minutes (Azure tokens last 10 min)
// ───────────────────────────────────────────────────────────────────────────

export async function GET() {
  // ── 1. Return cached token if still valid ──────────────────────────────
  if (cachedToken && Date.now() < tokenCacheExpiry) {
    return NextResponse.json(cachedToken, {
      headers: { 'Cache-Control': 'private, max-age=540' },
    })
  }

  // ── 2. Get Azure config (with cache to avoid repeated DB queries) ───────
  let config: AzureConfig | null = cachedConfig && Date.now() < configCacheExpiry
    ? cachedConfig
    : null

  if (!config) {
    try {
      const raw = await getAzureSpeechConfig()
      if (raw?.key && raw?.region) {
        config = { key: raw.key, region: raw.region }
        cachedConfig = config
        configCacheExpiry = Date.now() + CONFIG_TTL_MS
      } else {
        // Cache the "not configured" state for 1 minute to prevent DB hammering
        cachedConfig = null
        configCacheExpiry = Date.now() + 60_000
      }
    } catch (err) {
      console.error('[speech-token] Failed to load Azure config from DB:', err)
      return NextResponse.json(
        { error: 'Failed to load Azure Speech configuration' },
        { status: 500 },
      )
    }
  }

  if (!config?.key) {
    return NextResponse.json(
      { error: 'Azure Speech not configured. Set azureSpeechKey in Admin > System Config.' },
      { status: 503 },
    )
  }

  // ── 3. Fetch a new token from Azure (5-second timeout) ──────────────────
  try {
    console.log('[speech-token] Fetching new token from Azure...')
    const tokenRes = await fetch(
      `https://${config.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': config.key,
          'Content-Length': '0',
        },
        signal: AbortSignal.timeout(5000),
      },
    )

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      console.error('[speech-token] Azure token fetch failed:', tokenRes.status, errText)
      return NextResponse.json(
        { error: `Azure Speech token fetch failed: ${tokenRes.status}` },
        { status: 502 },
      )
    }

    const token = await tokenRes.text()
    const result = { token, region: config.region }

    // Cache the token for 9 minutes
    cachedToken = result
    tokenCacheExpiry = Date.now() + TOKEN_TTL_MS

    console.log('[speech-token] New token issued and cached (9 min TTL)')
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=540' },
    })
  } catch (err: any) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    console.error('[speech-token]', isTimeout ? 'Azure request timed out (>5s)' : err)
    return NextResponse.json(
      { error: isTimeout ? 'Azure Speech service timed out' : 'Internal error fetching speech token' },
      { status: isTimeout ? 504 : 500 },
    )
  }
}
