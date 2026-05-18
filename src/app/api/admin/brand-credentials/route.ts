import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/brand-credentials
// Admin-only: returns unmasked loginUsername + loginPassword for all brand accounts
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const accounts = await prisma.socialAccount.findMany({
    select: {
      id: true,
      platformId: true,
      handle: true,
      displayName: true,
      profileUrl: true,
      loginUsername: true,
      loginPassword: true,  // unmasked for admin
      brand: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ brand: { name: 'asc' } }, { platformId: 'asc' }],
  })

  return NextResponse.json(accounts)
}
