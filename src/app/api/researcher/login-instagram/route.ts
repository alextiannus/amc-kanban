import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureAccountSnapshot } from '@/lib/captureSnapshots'
import { authenticateRequest, requireCapability } from '@/lib/auth-v2'

export async function POST(request: Request) {
  const principal = await authenticateRequest(request)
  if (!principal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { accountId, username, password } = body

    if (!accountId || !username || !password) {
      return NextResponse.json({ error: 'Missing accountId, username or password' }, { status: 400 })
    }
    const account = await prisma.socialAccount.findUnique({
      where: { id: accountId },
      select: { brandId: true },
    })
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    try {
      await requireCapability(principal, 'brand.update', { brandId: account.brandId })
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
