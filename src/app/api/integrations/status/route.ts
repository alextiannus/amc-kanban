import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLarkTenantToken } from '@/lib/integrations/lark'
import { getPlaceRating } from '@/lib/integrations/google'
import { postfastTestConnection } from '@/lib/integrations/postfast'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'
import { bridgeState } from '@/lib/integrations/extensionBridge'

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
      googleRefreshToken: true, googleAccountId: true,
      googleLocationId: true, googleLocationName: true,
      googlePreferOAuth: true,
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

    // Google: try checking oauth refresh token or fetching place rating
    (async () => {
      // Prioritize Direct Google Business Profile OAuth2 Flow
      if (brand.googlePreferOAuth && brand.googleRefreshToken) {
        try {
          const { getGoogleAccessToken } = await import('@/lib/integrations/google')
          const accessToken = await getGoogleAccessToken(brand.googleRefreshToken)
          const ok = !!accessToken && !!brand.googleLocationId && !!brand.googleAccountId
          return {
            name: 'google',
            ok,
            message: ok
              ? `已连接 Google 账号 (店铺: ${brand.googleLocationName || '未命名店铺'})`
              : !accessToken
              ? '连接失败，授权已失效'
              : '连接异常，未绑定有效的商家店铺位置',
            via: 'oauth',
            locationName: brand.googleLocationName
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : '未知错误'
          return { name: 'google', ok: false, message: `授权连接失败: ${message}`, via: 'oauth' }
        }
      }

      if (!brand.googlePlaceId || !brand.googleApiKey) {
        return { name: 'google', ok: false, message: '未配置 Place ID 或 API Key，或未连接 Google 账号' }
      }
      const { rating } = await getPlaceRating(brand.googlePlaceId, brand.googleApiKey)
      return {
        name: 'google',
        ok: rating !== null,
        message: rating !== null ? `连通正常 (评分: ${rating}★)` : '连接失败，请检查 API Key',
        via: 'apikey',
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

    // Extension: check if the extension bridge is active for this brand
    (async () => {
      const ok = bridgeState.activeExtensions.has(brandId)
      return {
        name: 'extension',
        ok,
        message: ok ? '浏览器插件已连接' : '未连接插件（请确保看板页面处于开启状态且安装了插件）',
      }
    })(),

    // Meta: check if brand has any connected Facebook or Instagram accounts with tokens
    (async () => {
      const metaAccounts = await prisma.socialAccount.findMany({
        where: {
          brandId,
          platformId: { in: ['facebook', 'instagram'] },
          accessToken: { not: null },
        },
        select: {
          platformId: true,
          displayName: true,
          handle: true,
        },
      })

      const ok = metaAccounts.length > 0
      let message = '未连接 Meta 账号'
      if (ok) {
        const pages = metaAccounts.filter((a: any) => a.platformId === 'facebook')
        const igs = metaAccounts.filter((a: any) => a.platformId === 'instagram')
        const details: string[] = []
        if (pages.length > 0) {
          details.push(`Facebook Page: ${pages.map((p: any) => p.displayName || p.handle).join(', ')}`)
        }
        if (igs.length > 0) {
          details.push(`Instagram: ${igs.map((i: any) => i.displayName || i.handle).join(', ')}`)
        }
        message = `已连接 Meta (${details.join(' | ')})`
      }

      return {
        name: 'meta',
        ok,
        message,
      }
    })(),
  ])

  const statuses = results.map(r => r.status === 'fulfilled' ? r.value : { name: 'unknown', ok: false, message: 'Error' })

  return NextResponse.json({ statuses })
}
