import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLarkTenantToken } from '@/lib/integrations/lark'
import { getPlaceRating } from '@/lib/integrations/google'
import { postfastTestConnection } from '@/lib/integrations/postfast'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'

/**
 * GET /api/integrations/status?brandId=<id>
 * Returns live connectivity status for all configured integrations.
 * Used by the Settings UI to show green/red badges.
 */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      postfastApiKey: true,
      googlePlaceId: true, googleApiKey: true,
      larkAppId: true, larkAppSecret: true,
      larkDriveFolderId: true, larkBotWebhook: true,
    },
  })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const results = await Promise.allSettled([
    // PostFast: live ping via account list
    (async () => {
      if (!brand.postfastApiKey) {
        return { name: 'postfast', ok: false, message: '未配置 PostFast API Key', accountCount: 0 }
      }
      const r = await postfastTestConnection(brand.postfastApiKey)
      return {
        name: 'postfast',
        ok: r.success,
        accountCount: r.accountCount ?? 0,
        message: r.success
          ? `连通正常 (${r.accountCount} 个账号已连接)`
          : `连接失败: ${r.error}`,
      }
    })(),

    // Google: try fetching place rating
    (async () => {
      if (!brand.googlePlaceId || !brand.googleApiKey) {
        return { name: 'google', ok: false, message: '未配置 Place ID 或 API Key' }
      }
      const { rating } = await getPlaceRating(brand.googlePlaceId, brand.googleApiKey)
      return {
        name: 'google',
        ok: rating !== null,
        message: rating !== null ? `连通正常 (评分: ${rating}★)` : '连接失败，请检查 API Key',
      }
    })(),

    // Lark: try getting a token
    (async () => {
      if (!brand.larkAppId || !brand.larkAppSecret) {
        return { name: 'lark', ok: false, message: '未配置 App ID 或 App Secret' }
      }
      const token = await getLarkTenantToken(brand.larkAppId, brand.larkAppSecret)
      return {
        name: 'lark',
        ok: !!token,
        message: token ? '连通正常' : '连接失败，请检查 App ID / Secret',
        driveReady: !!brand.larkDriveFolderId,
        notifyReady: !!brand.larkBotWebhook,
      }
    })(),
  ])

  const statuses = results.map(r => r.status === 'fulfilled' ? r.value : { name: 'unknown', ok: false, message: 'Error' })

  return NextResponse.json({ statuses })
}
