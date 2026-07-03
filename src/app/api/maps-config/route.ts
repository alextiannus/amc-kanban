import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

/**
 * GET /api/maps-config
 *
 * Returns the Google Maps JS API key for client-side Places Autocomplete.
 * Key is stored in GOOGLE_MAPS_API_KEY environment variable.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || ''
  if (!mapsApiKey) {
    return NextResponse.json({ error: 'Maps API not configured' }, { status: 503 })
  }

  return NextResponse.json(
    { mapsApiKey },
    { headers: { 'Cache-Control': 'private, max-age=3600' } }
  )
}
