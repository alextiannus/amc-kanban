import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

  if (!session?.user && !apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (apiKey && !authenticatedAgent) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const placeId = searchParams.get('placeId')

  if (!placeId) {
    return NextResponse.json({ error: 'placeId is required' }, { status: 400 })
  }

  // Try to find the API key in the database for the brand configured with this placeId
  const brand = await prisma.brand.findFirst({
    where: { googlePlaceId: placeId },
    select: { id: true, name: true, location: true, googleApiKey: true, address: true }
  })

  const apiKeyToUse = brand?.googleApiKey || process.env.GOOGLE_API_KEY || process.env.GOOGLE_MAPS_API_KEY

  if (!apiKeyToUse) {
    return NextResponse.json({
      error: 'Google Places API Key is not configured',
      details: `placeId=${placeId}; no brand googleApiKey, GOOGLE_API_KEY, or GOOGLE_MAPS_API_KEY was found.`,
    }, { status: 400 })
  }

  try {
    const fields = 'name,formatted_address,opening_hours,rating,user_ratings_total,editorial_summary'
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&key=${apiKeyToUse}&fields=${fields}&language=zh-CN`

    const res = await fetch(url)
    const data = await res.json()

    if (data.status === 'OK' && data.result) {
      const r = data.result
      return NextResponse.json({
        success: true,
        source: 'google_places_api',
        placeId,
        name: r.name,
        address: r.formatted_address,
        openingHours: r.opening_hours?.weekday_text || [],
        rating: r.rating || null,
        reviewsCount: r.user_ratings_total || 0,
        summary: r.editorial_summary?.overview || ''
      })
    }

    console.error('Google Places API returned status:', data.status, data.error_message)
    return NextResponse.json(
      {
        error: 'Google Places API request failed',
        details: data.error_message || `Google Places API returned ${data.status || 'unknown status'} for placeId ${placeId}`,
        googleStatus: data.status || null,
      },
      { status: 502 }
    )
  } catch (e: any) {
    console.error('Failed to fetch from Google Places API:', e.message)
    return NextResponse.json({
      error: 'Failed to fetch from Google Places API',
      details: e.message || String(e),
    }, { status: 502 })
  }
}
