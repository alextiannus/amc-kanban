import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { captureAccountSnapshot } from '@/lib/captureSnapshots'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify permission
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { businessRoles: true },
  })
  const isOwnerOrAdmin = user?.role === 'ADMIN' || user?.businessRoles.some(r => r.role === 'BRAND_OWNER' || r.role === 'BRAND_DIRECTOR' || r.role === 'AMC_PRINCIPAL')
  if (!isOwnerOrAdmin) {
    return NextResponse.json({ error: 'Unauthorized: insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { accountId, username, password } = body

    if (!accountId || !username || !password) {
      return NextResponse.json({ error: 'Missing accountId, username or password' }, { status: 400 })
    }

    // 1. Update social account credentials in DB
    await prisma.socialAccount.update({
      where: { id: accountId },
      data: {
        loginUsername: username.trim(),
        loginPassword: password.trim(),
      }
    })

    console.log(`[AMC Researcher] Credentials updated for account ${accountId}. Running login crawler...`)

    // 2. Run captureAccountSnapshot synchronously
    const imageUrl = await captureAccountSnapshot(accountId)

    return NextResponse.json({ success: true, imageUrl })
  } catch (e) {
    console.error('[AMC Researcher] Instagram login crawler failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Login or snapshot capture failed' }, { status: 400 })
  }
}
