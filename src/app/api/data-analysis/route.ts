import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId') || undefined
  const platformId = searchParams.get('platformId') || undefined
  const ownerId = searchParams.get('ownerId') || undefined
  const sortOrder = (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc'

  try {
    const accounts = await prisma.socialAccount.findMany({
      where: {
        brand: {
          status: 'ACTIVE',
          ...(brandId ? { id: brandId } : {}),
          ...(ownerId ? {
            owners: {
              some: { userId: ownerId }
            }
          } : {}),
        },
        ...(platformId ? { platformId } : {}),
      },
      include: {
        brand: {
          include: {
            owners: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    nickname: true,
                  }
                }
              }
            }
          }
        },
        snapshots: {
          orderBy: { capturedAt: 'desc' },
          take: 20,
        }
      },
      orderBy: {
        brand: {
          name: sortOrder
        }
      }
    })

    // Format the response for easy consumption by the frontend
    const results = accounts.map((acc: any) => {
      const realSnapshot = acc.snapshots.find((s: any) => s.isReal)
      const latestSnapshot = realSnapshot || acc.snapshots[0] || null
      const amcOwners = acc.brand.owners.map((bo: any) => ({
        id: bo.user.id,
        email: bo.user.email,
        nickname: bo.user.nickname || bo.user.email.split('@')[0],
      }))

      return {
        accountId: acc.id,
        platformId: acc.platformId,
        handle: acc.handle,
        profileUrl: acc.profileUrl,
        followerCount: acc.followerCount,
        ratingScore: acc.ratingScore,
        snapshotAt: acc.snapshotAt,
        brand: {
          id: acc.brand.id,
          name: acc.brand.name,
          location: acc.brand.location,
        },
        owners: amcOwners,
        latestSnapshot: latestSnapshot ? {
          id: latestSnapshot.id,
          imageUrl: latestSnapshot.imageUrl,
          capturedAt: latestSnapshot.capturedAt,
          isUserUploaded: latestSnapshot.isUserUploaded,
          isReal: latestSnapshot.isReal,
        } : null,
        hasCredentials: !!acc.loginUsername,
      }
    })

    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to query snapshots' }, { status: 500 })
  }
}
