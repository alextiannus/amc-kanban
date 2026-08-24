import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { postfastGetGBPLocationsForInternalAccount } from '@/lib/integrations/postfast'

type Params = { params: Promise<{ id: string; aid: string }> }

function isGooglePlatform(platformId: string) {
  return ['google', 'google_business', 'google_maps', 'google_map', 'google_business_profile', 'google_my_business', 'gbp', 'gmb']
    .includes(platformId.toLowerCase().trim())
}

export async function GET(_request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, aid: accountId } = await params
  if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [brand, account] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true } }),
    prisma.socialAccount.findFirst({
      where: { id: accountId, brandId },
      select: { id: true, platformId: true, handle: true },
    }),
  ])
  if (!brand || !account) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!isGooglePlatform(account.platformId) || account.handle === 'unconfigured') {
    return NextResponse.json({
      code: 'GOOGLE_LOCATION_UNAVAILABLE',
      error: '该账号不是已连接的 Google Business 账号。',
    }, { status: 422 })
  }
  if (!brand.postfastApiKey) {
    return NextResponse.json({
      code: 'GOOGLE_LOCATION_UNAVAILABLE',
      error: '品牌尚未配置 PostFast，无法读取 Google Business 门店。',
    }, { status: 422 })
  }

  const result = await postfastGetGBPLocationsForInternalAccount(brand.postfastApiKey, account.id)
  if (!result.success) {
    return NextResponse.json({
      code: 'GOOGLE_LOCATION_UNAVAILABLE',
      error: result.error || 'Google Business 门店加载失败。',
    }, { status: 502 })
  }

  return NextResponse.json({
    locations: result.locations,
    socialMediaId: result.socialMediaId,
  })
}
