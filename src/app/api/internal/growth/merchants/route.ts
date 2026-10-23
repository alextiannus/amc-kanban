import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { growthDirectoryAuthorized, listGrowthMerchants } from '@/lib/growthMerchantDirectory'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  if (!growthDirectoryAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json(await listGrowthMerchants(prisma, new URL(request.url).searchParams)) }
  catch (error) {
    if ((error as Error).message === 'invalid_pagination') return NextResponse.json({ error: 'invalid_pagination' }, { status: 400 })
    throw error
  }
}
