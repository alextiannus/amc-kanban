import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'

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
  const category = searchParams.get('category') || 'chinese_restaurant'
  const location = searchParams.get('location') || 'Singapore'
  const platform = searchParams.get('platform')

  // Generate realistic benchmark data based on category and location
  // Different categories have different characteristic engagement rates and follower averages.
  let baseEngRate = 3.5
  let baseFollowers = 5000
  let baseRating = 4.5
  let baseReviewsCount = 120

  const catLower = category.toLowerCase()
  if (catLower.includes('restaurant') || catLower.includes('food') || catLower.includes('eat') || catLower.includes('cafe')) {
    baseEngRate = 4.2
    baseFollowers = 8000
    baseRating = 4.6
    baseReviewsCount = 350
  } else if (catLower.includes('yoga') || catLower.includes('fitness') || catLower.includes('gym') || catLower.includes('studio')) {
    baseEngRate = 4.8
    baseFollowers = 3500
    baseRating = 4.8
    baseReviewsCount = 95
  } else if (catLower.includes('furniture') || catLower.includes('design') || catLower.includes('home')) {
    baseEngRate = 2.1
    baseFollowers = 12000
    baseRating = 4.4
    baseReviewsCount = 60
  } else if (catLower.includes('retail') || catLower.includes('shop') || catLower.includes('boutique')) {
    baseEngRate = 2.8
    baseFollowers = 9500
    baseRating = 4.3
    baseReviewsCount = 85
  }

  // Modulate slightly based on location length/value as a pseudo-random seed
  const seed = (location.length * 7) % 10
  const engModifier = 1 + (seed - 5) / 50 // ±10% variation
  const folModifier = 1 + (seed - 5) / 20 // ±25% variation

  const igEng = Number((baseEngRate * engModifier).toFixed(2))
  const fbEng = Number((baseEngRate * 0.4 * engModifier).toFixed(2))
  const xhsEng = Number((baseEngRate * 1.5 * engModifier).toFixed(2)) // Xiaohongshu has higher engagement usually

  const igFollowers = Math.round(baseFollowers * folModifier)
  const fbFollowers = Math.round(baseFollowers * 1.5 * folModifier)
  const xhsFollowers = Math.round(baseFollowers * 0.8 * folModifier)

  const rating = Number(Math.min(5.0, baseRating + (seed - 5) / 50).toFixed(2))
  const reviewsCount = Math.round(baseReviewsCount * folModifier)

  const allMetrics: Record<string, any> = {
    instagram: {
      avgEngagementRate: igEng,
      medianEngagementRate: Number((igEng * 0.9).toFixed(2)),
      p75EngagementRate: Number((igEng * 1.3).toFixed(2)),
      followersAvg: igFollowers,
      postsPerWeekAvg: 3.5
    },
    facebook: {
      avgEngagementRate: fbEng,
      medianEngagementRate: Number((fbEng * 0.95).toFixed(2)),
      p75EngagementRate: Number((fbEng * 1.25).toFixed(2)),
      followersAvg: fbFollowers,
      postsPerWeekAvg: 2.8
    },
    xiaohongshu: {
      avgEngagementRate: xhsEng,
      medianEngagementRate: Number((xhsEng * 0.85).toFixed(2)),
      p75EngagementRate: Number((xhsEng * 1.4).toFixed(2)),
      followersAvg: xhsFollowers,
      postsPerWeekAvg: 4.2
    },
    google_maps: {
      avgRating: rating,
      reviewsAvgCount: reviewsCount,
      responseRateAvg: 85 // %
    }
  }

  const result: any = {
    category,
    location,
    metrics: platform && allMetrics[platform] ? { [platform]: allMetrics[platform] } : allMetrics
  }

  return NextResponse.json(result)
}
