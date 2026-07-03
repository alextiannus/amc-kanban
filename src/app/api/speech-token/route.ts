import { NextResponse } from 'next/server'

/**
 * GET /api/speech-token
 *
 * Azure Speech integration is currently disabled.
 * The app uses the browser's built-in Web Speech API instead.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { error: 'Azure Speech not in use. App uses Web Speech API.' },
    {
      status: 503,
      headers: { 'Cache-Control': 'public, max-age=3600' },
    },
  )
}
