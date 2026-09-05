/**
 * POST /api/integrations/postfast
 * REST proxy exposing PostFast operations to the UI and to agents via HTTP fallback.
 *
 * Body: { brandId, action, ...params }
 *
 * Actions:
 *   test_connection   — validate API key, return account count
 *   list_accounts     — list connected social accounts
 *   list_posts        — list scheduled/published posts
 *   delete_post       — cancel a scheduled post { postId }
 *   generate_connect_link — create a client connect link
 *   get_gbp_locations — list GBP locations { accountId }
 *   get_follower_history — list account follower snapshots { accountId }
 *   search_places — search Instagram places { accountId, query }
 *   get_tiktok_sounds — list TikTok commercial sounds { accountId }
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAgentFromKey } from '@/lib/partner/mcp/server'
import { prisma } from '@/lib/prisma'
import {
  postfastTestConnection,
  postfastFetchAccounts,
  postfastListPosts,
  postfastDeletePost,
  postfastGenerateConnectLink,
  postfastGetGBPLocations,
  postfastGetFollowerHistory,
  postfastGetTikTokSounds,
  postfastSearchPlaces,
  postfastListInboxConversations,
  postfastListInboxItems,
} from '@/lib/integrations/postfast'

type PostFastRouteBody = {
  brandId?: string
  action?: string
  status?: string
  platform?: string
  limit?: number
  page?: number
  postId?: string
  label?: string
  redirectUrl?: string
  accountId?: string
  query?: string
  conversationId?: string
}

// ── Auth: accept session OR agent API key ──────────────────────────────────

async function resolveAccess(request: Request): Promise<{
  userId?: string
  userRole?: string
  agentId?: string
  error?: string
}> {
  const authHeader = request.headers.get('Authorization') ?? ''
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const agent = await getAgentFromKey(authHeader)
    if (agent) return { agentId: agent.id }
  }
  const session = await getSession()
  if (session?.user?.id) return { userId: session.user.id, userRole: session.user.role }
  return { error: 'Unauthorized' }
}

async function getBrandApiKey(
  brandId: string,
  access: { userId?: string; userRole?: string; agentId?: string }
): Promise<string | null> {
  if (access.userId) {
    const { canHumanAccessBrandProject } = await import('@/lib/brandAccess')
    const hasAccess = await canHumanAccessBrandProject(brandId, access.userId, access.userRole)
    if (!hasAccess) return null

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { postfastApiKey: true },
    })
    return brand?.postfastApiKey ?? null
  }
  if (access.agentId) {
    const { canAgentAccessBrand } = await import('@/lib/brandAccess')
    const hasAccess = await canAgentAccessBrand(brandId, access.agentId)
    if (!hasAccess) return null

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { postfastApiKey: true },
    })
    return brand?.postfastApiKey ?? null
  }
  return null
}

async function getPostfastAccountId(brandId: string, accountId: string) {
  const account = await prisma.socialAccount.findFirst({
    where: { brandId, postfastAccountId: accountId },
    select: { postfastAccountId: true },
  })
  return account?.postfastAccountId ?? null
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const access = await resolveAccess(request)
  if (access.error) return NextResponse.json({ error: access.error }, { status: 401 })

  let body: PostFastRouteBody
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { brandId, action, ...params } = body
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  const apiKey = await getBrandApiKey(brandId, access)
  if (!apiKey) {
    return NextResponse.json({
      error: 'PostFast API key not configured for this brand. Configure it in brand settings.',
    }, { status: 422 })
  }

  switch (action) {
    case 'test_connection': {
      const result = await postfastTestConnection(apiKey)
      return NextResponse.json(result)
    }

    case 'list_accounts': {
      const result = await postfastFetchAccounts(apiKey)
      return NextResponse.json(result)
    }

    case 'list_posts': {
      const status =
        params.status === 'scheduled' ||
        params.status === 'published' ||
        params.status === 'failed' ||
        params.status === 'draft'
          ? params.status
          : undefined

      const result = await postfastListPosts(apiKey, {
        status,
        platform: params.platform,
        limit: params.limit ?? 20,
        page: params.page,
      })
      return NextResponse.json(result)
    }

    case 'delete_post': {
      if (!params.postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })
      const result = await postfastDeletePost(apiKey, params.postId)
      return NextResponse.json(result)
    }

    case 'generate_connect_link': {
      const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { name: true } })
      const result = await postfastGenerateConnectLink(apiKey, {
        label: params.label ?? brand?.name,
        redirectUrl: params.redirectUrl,
      })
      if (!result.success || !result.connectUrl) {
        return NextResponse.json(result)
      }

      const updatedAt = new Date()
      await prisma.brand.update({
        where: { id: brandId },
        data: {
          postfastConnectLink: result.connectUrl,
          postfastConnectLinkUpdatedAt: updatedAt,
        },
      })

      return NextResponse.json({ ...result, updatedAt: updatedAt.toISOString() })
    }

    case 'get_gbp_locations': {
      if (!params.accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })
      const accountId = await getPostfastAccountId(brandId, params.accountId)
      if (!accountId) return NextResponse.json({ error: 'PostFast account not found' }, { status: 404 })
      const result = await postfastGetGBPLocations(apiKey, accountId)
      return NextResponse.json(result)
    }

    case 'get_follower_history': {
      if (!params.accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })
      const accountId = await getPostfastAccountId(brandId, params.accountId)
      if (!accountId) return NextResponse.json({ error: 'PostFast account not found' }, { status: 404 })
      return NextResponse.json(await postfastGetFollowerHistory(apiKey, accountId))
    }

    case 'search_places': {
      if (!params.query) return NextResponse.json({ error: 'query required' }, { status: 400 })
      return NextResponse.json(await postfastSearchPlaces(apiKey, params.query))
    }

    case 'get_tiktok_sounds': {
      if (!params.accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })
      const accountId = await getPostfastAccountId(brandId, params.accountId)
      if (!accountId) return NextResponse.json({ error: 'PostFast account not found' }, { status: 404 })
      return NextResponse.json(await postfastGetTikTokSounds(apiKey, accountId))
    }

    case 'list_inbox_conversations': {
      const result = await postfastListInboxConversations(apiKey, { limit: params.limit, page: params.page })
      if (!result.success) return NextResponse.json(result)

      const accounts = await prisma.socialAccount.findMany({
        where: { brandId, postfastAccountId: { not: null } },
        select: { postfastAccountId: true },
      })
      const allowedPostfastAccountIds = new Set(accounts.flatMap((account: { postfastAccountId: string | null }) => account.postfastAccountId ? [account.postfastAccountId] : []))
      const conversations = result.conversations.filter((conversation) =>
        Boolean(conversation.socialMediaId) && allowedPostfastAccountIds.has(conversation.socialMediaId!),
      )
      return NextResponse.json({ ...result, conversations, total: conversations.length })
    }

    case 'get_inbox_items': {
      if (!params.conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
      const conversation = await prisma.postfastInboxConversation.findUnique({
        where: { brandId_providerId: { brandId, providerId: params.conversationId } },
        select: { providerId: true },
      })
      if (!conversation) return NextResponse.json({ error: 'Inbox conversation not found' }, { status: 404 })
      return NextResponse.json(await postfastListInboxItems(apiKey, conversation.providerId, { limit: params.limit, page: params.page }))
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}

// ── GET: quick connection test ─────────────────────────────────────────────

export async function GET(request: Request) {
  const access = await resolveAccess(request)
  if (access.error) return NextResponse.json({ error: access.error }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const apiKey = await getBrandApiKey(brandId, access)
  if (!apiKey) return NextResponse.json({ ok: false, configured: false, message: '未配置 PostFast API Key' })

  const result = await postfastTestConnection(apiKey)
  return NextResponse.json({
    ok: result.success,
    configured: true,
    accountCount: result.accountCount,
    message: result.success
      ? `连通正常 (${result.accountCount} 个社媒账号)`
      : `连接失败: ${result.error}`,
  })
}
