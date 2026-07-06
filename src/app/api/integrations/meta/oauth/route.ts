import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'
import { getDirectMetaConfig } from '@/lib/systemConfig'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  if (!brandId) {
    return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  }

  // Verify brand exists
  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  // Verify user has access to this brand
  if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Retrieve global Meta app configurations
  const metaConfig = await getDirectMetaConfig()
  if (!metaConfig || !metaConfig.appId || !metaConfig.redirectUri) {
    return NextResponse.json(
      { error: 'Meta integration is not configured. Please configure Meta App ID and Redirect URI in Admin Panel.' },
      { status: 400 }
    )
  }

  // Generate a cryptographically secure state nonce for CSRF prevention
  const stateNonce = crypto.randomUUID()

  // Save the state nonce and brandId in a secure cookie
  const cookieStore = await cookies()
  cookieStore.set('meta_oauth_state', JSON.stringify({ state: stateNonce, brandId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300, // 5 minutes
  })

  // Construct Meta OAuth 2.0 URL
  const oauthUrl = new URL('https://www.facebook.com/v20.0/dialog/oauth')
  oauthUrl.searchParams.set('client_id', metaConfig.appId)
  oauthUrl.searchParams.set('redirect_uri', metaConfig.redirectUri)
  oauthUrl.searchParams.set('response_type', 'code')
  oauthUrl.searchParams.set('state', stateNonce)
  oauthUrl.searchParams.set(
    'scope',
    'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish'
  )

  return NextResponse.redirect(oauthUrl)
}
