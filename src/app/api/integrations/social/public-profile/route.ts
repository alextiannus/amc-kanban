import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publicSocialProfileResponse } from '@/lib/publicSocialProfile'

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
  const platform = searchParams.get('platform')
  const handle = searchParams.get('handle')

  if (!platform || !handle) {
    return NextResponse.json({ error: 'platform and handle are required' }, { status: 400 })
  }

  const normalizedPlatform = platform.toLowerCase().trim()
  if (!['instagram', 'facebook'].includes(normalizedPlatform)) {
    return NextResponse.json({ error: 'Supported platforms are: instagram, facebook' }, { status: 400 })
  }

  const normalizedHandle = handle.trim().replace(/^@+/, '').trim()
  if (!normalizedHandle) {
    return NextResponse.json({ error: 'handle must not be empty' }, { status: 400 })
  }

  // 1. Try to find existing social account records in the database
  const dbAccount = await prisma.socialAccount.findFirst({
    where: {
      platformId: normalizedPlatform,
      handle: { equals: normalizedHandle, mode: 'insensitive' },
      unboundAt: null,
    },
    select: {
      displayName: true,
      followerCount: true,
      profileUrl: true,
      snapshotAt: true,
      followerCountUpdatedAt: true,
    },
    orderBy: [
      { followerCountUpdatedAt: { sort: 'desc', nulls: 'last' } },
      { snapshotAt: { sort: 'desc', nulls: 'last' } },
      { updatedAt: 'desc' },
    ],
  })

  return NextResponse.json(publicSocialProfileResponse({
    platform: normalizedPlatform as 'instagram' | 'facebook',
    handle: normalizedHandle,
    account: dbAccount,
  }), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
