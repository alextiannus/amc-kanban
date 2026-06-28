import { NextRequest, NextResponse } from 'next/server'
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
 * Response:
 * { token: string; region: string }
 */
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const config = await getAzureSpeechConfig()

  if (!config?.key) {
    return NextResponse.json(
      { error: 'Azure Speech not configured. Set azureSpeechKey in Admin > System Config.' },
      { status: 503 },
    )
  }

  try {
    // Exchange subscription key for a temporary token (10 min TTL)
    const tokenRes = await fetch(
      `https://${config.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': config.key,
          'Content-Length': '0',
        },
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
    return NextResponse.json(
      { token, region: config.region },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (err) {
    console.error('[speech-token] Error:', err)
    return NextResponse.json({ error: 'Internal error fetching speech token' }, { status: 500 })
  }
}
