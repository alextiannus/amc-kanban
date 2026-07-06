import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'
import { getDirectMetaConfig } from '@/lib/systemConfig'
import {
  exchangeMetaCodeForUserToken,
  fetchMetaPages,
  fetchLinkedInstagramAccount,
} from '@/lib/integrations/meta'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const stateParam = url.searchParams.get('state')

  if (!code || !stateParam) {
    return NextResponse.json({ error: 'code and state parameters required' }, { status: 400 })
  }

  // 1. Authenticate user session
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Retrieve and verify state from cookie (CSRF protection)
  const cookieStore = await cookies()
  const stateCookieVal = cookieStore.get('meta_oauth_state')?.value
  if (!stateCookieVal) {
    return NextResponse.json({ error: 'Missing OAuth session state cookie' }, { status: 400 })
  }

  let oauthSession: { state: string; brandId: string }
  try {
    oauthSession = JSON.parse(stateCookieVal)
  } catch {
    return NextResponse.json({ error: 'Invalid OAuth session state cookie' }, { status: 400 })
  }

  if (oauthSession.state !== stateParam) {
    return NextResponse.json({ error: 'CSRF validation failed: state mismatch' }, { status: 403 })
  }

  const brandId = oauthSession.brandId

  // 3. Clear the cookie immediately to prevent replay
  cookieStore.delete('meta_oauth_state')

  // 4. Verify user has access to this brand
  if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // 5. Retrieve global Meta config
    const metaConfig = await getDirectMetaConfig()
    if (!metaConfig || !metaConfig.appId || !metaConfig.appSecret || !metaConfig.redirectUri) {
      return NextResponse.json({ error: 'Meta integration is not configured globally.' }, { status: 400 })
    }

    // 6. Exchange code for Long-Lived User Access Token
    const userAccessToken = await exchangeMetaCodeForUserToken({
      code,
      redirectUri: metaConfig.redirectUri,
      appId: metaConfig.appId,
      appSecret: metaConfig.appSecret,
    })

    // 7. Fetch Pages
    const pages = await fetchMetaPages(userAccessToken)
    if (pages.length === 0) {
      const redirectUrl = new URL('/board', url.origin)
      redirectUrl.searchParams.set('meta_error', 'no_pages_found')
      return NextResponse.redirect(redirectUrl)
    }

    // 8. Discover linked Instagram accounts and upsert pages/IG accounts to SocialAccount table
    let instagramAccountsAdded = 0
    let facebookPagesAdded = 0

    for (const page of pages) {
      // Upsert Facebook Page SocialAccount
      await prisma.socialAccount.upsert({
        where: {
          brandId_platformId_handle: {
            brandId,
            platformId: 'facebook',
            handle: page.id,
          },
        },
        create: {
          brandId,
          platformId: 'facebook',
          handle: page.id,
          displayName: page.name,
          accessToken: page.access_token,
          autoPilot: true,
        },
        update: {
          displayName: page.name,
          accessToken: page.access_token,
        },
      })
      facebookPagesAdded++

      // Look up and upsert Instagram Business Account if linked
      const igAccount = await fetchLinkedInstagramAccount({
        pageId: page.id,
        pageAccessToken: page.access_token,
      })

      if (igAccount) {
        await prisma.socialAccount.upsert({
          where: {
            brandId_platformId_handle: {
              brandId,
              platformId: 'instagram',
              handle: igAccount.id,
            },
          },
          create: {
            brandId,
            platformId: 'instagram',
            handle: igAccount.id,
            displayName: igAccount.name || igAccount.username,
            accessToken: igAccount.pageAccessToken, // Instagram uses Page Access Token
            profileUrl: igAccount.username ? `https://instagram.com/${igAccount.username}` : null,
            followerCount: igAccount.followersCount ?? null,
            autoPilot: true,
          },
          update: {
            displayName: igAccount.name || igAccount.username,
            accessToken: igAccount.pageAccessToken,
            profileUrl: igAccount.username ? `https://instagram.com/${igAccount.username}` : null,
            followerCount: igAccount.followersCount ?? null,
          },
        })
        instagramAccountsAdded++
      }
    }

    console.log(
      `[Meta OAuth] Successfully connected accounts for brand ${brandId}. Pages: ${facebookPagesAdded}, IG accounts: ${instagramAccountsAdded}`
    )

    const redirectUrl = new URL('/board', url.origin)
    redirectUrl.searchParams.set('meta_success', 'true')
    return NextResponse.redirect(redirectUrl)
  } catch (e: unknown) {
    console.error('[Meta OAuth Callback Error]', e)
    const message = e instanceof Error ? e.message : 'OAuth callback failed'
    const redirectUrl = new URL('/board', url.origin)
    redirectUrl.searchParams.set('meta_error', encodeURIComponent(message))
    return NextResponse.redirect(redirectUrl)
  }
}
