import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGeminiApiKey } from '@/lib/systemConfig'

/**
 * GET /api/client-config
 *
 * Returns client-side configuration for authenticated users.
 * Exposes the Gemini API key so the browser can call Gemini directly,
 * bypassing the Render server for latency-sensitive chat turns.
 *
 * ⚠️  Option C (internal testing): Key is visible in browser DevTools.
 *     For production, upgrade to Firebase AI Logic or short-lived tokens.
 */
export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const geminiApiKey = await getGeminiApiKey()
  if (!geminiApiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  return NextResponse.json(
    { geminiApiKey },
    {
      headers: {
        // Do NOT cache — always re-validate
        'Cache-Control': 'no-store',
      },
    },
  )
}
