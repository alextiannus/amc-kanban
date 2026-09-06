import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  postfastListInboxConversations,
  postfastListInboxItems,
  type PostFastInboxItem,
} from '@/lib/integrations/postfast'

function asDate(value: string | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function inboxItemData(conversationId: string, item: PostFastInboxItem) {
  return {
    conversationId,
    providerId: item.id,
    authorName: item.authorName,
    body: item.body,
    direction: item.direction,
    state: item.state,
    unread: item.unread,
    canReply: item.canReply,
    canPrivateReply: item.canPrivateReply,
    maxReplyLength: item.maxReplyLength,
    maxPrivateReplyLengthBytes: item.maxPrivateReplyLengthBytes,
    replyWindowEndsAt: asDate(item.replyWindowEndsAt),
    raw: item.raw as Prisma.InputJsonValue,
  }
}

export async function syncPostfastInbox(brandId: string, apiKey: string) {
  const pageLimit = 100
  const maxPages = 10
  const conversations = [] as Awaited<ReturnType<typeof postfastListInboxConversations>>['conversations']
  for (let page = 0; page < maxPages; page += 1) {
    const remote = await postfastListInboxConversations(apiKey, { limit: pageLimit, page })
    if (!remote.success) throw new Error(remote.error || 'Unable to list PostFast inbox conversations.')
    conversations.push(...remote.conversations)
    if (remote.hasNextPage === false) break
    if (remote.hasNextPage === undefined && remote.conversations.length < pageLimit) break
    if (page === maxPages - 1) throw new Error(`PostFast inbox conversation pagination capped at ${maxPages} pages for brand ${brandId}.`)
  }

  const [accounts, pendingActionItems] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { brandId, postfastAccountId: { not: null } },
      select: { id: true, postfastAccountId: true },
    }),
    prisma.actionItem.findMany({
      where: { brandId, type: 'social_inbox', status: 'pending' },
      select: { id: true, payload: true },
    }),
  ])
  const accountsByProviderId = new Map<string, { id: string; postfastAccountId: string | null }>(accounts.flatMap((account: { id: string; postfastAccountId: string | null }) =>
    account.postfastAccountId ? [[account.postfastAccountId, account] as const] : [],
  ))
  const pendingByConversationId = new Map<string, { id: string; payload: unknown }>(pendingActionItems.flatMap((item: { id: string; payload: unknown }) => {
    const providerConversationId = (item.payload as { providerConversationId?: unknown } | null)?.providerConversationId
    return typeof providerConversationId === 'string' ? [[providerConversationId, item] as const] : []
  }))
  const activeConversationIds = new Set<string>()
  const skippedConversationIds = new Set<string>()
  let syncedItems = 0
  let actionItems = 0
  for (const conversation of conversations.filter((entry) => entry.id)) {
    const account = conversation.socialMediaId ? accountsByProviderId.get(conversation.socialMediaId) : undefined
    if (!conversation.socialMediaId || !account) {
      skippedConversationIds.add(conversation.id)
      console.warn(`[PostFast Inbox] Skipping conversation ${conversation.id} for brand ${brandId}: ${conversation.socialMediaId ? 'no matching SocialAccount.postfastAccountId' : 'missing socialMediaId'}`)
      continue
    }
    const stored = await prisma.postfastInboxConversation.upsert({
      where: { brandId_providerId: { brandId, providerId: conversation.id } },
      create: {
        brandId, accountId: account.id, providerId: conversation.id, platform: conversation.platform,
        status: conversation.status || 'OPEN', subject: conversation.subject, participantName: conversation.participantName,
        unreadCount: conversation.unreadCount, needsAttention: conversation.needsAttention,
        lastMessageAt: asDate(conversation.lastMessageAt), raw: conversation.raw as Prisma.InputJsonValue,
      },
      update: {
        accountId: account.id, platform: conversation.platform, status: conversation.status || 'OPEN',
        subject: conversation.subject, participantName: conversation.participantName, unreadCount: conversation.unreadCount,
        needsAttention: conversation.needsAttention, lastMessageAt: asDate(conversation.lastMessageAt), lastSyncedAt: new Date(),
        raw: conversation.raw as Prisma.InputJsonValue,
      },
    })
    const items = [] as Awaited<ReturnType<typeof postfastListInboxItems>>['items']
    for (let page = 0; page < maxPages; page += 1) {
      const remoteItems = await postfastListInboxItems(apiKey, conversation.id, { limit: pageLimit, page })
      if (!remoteItems.success) throw new Error(remoteItems.error || `Unable to list inbox items for ${conversation.id}.`)
      items.push(...remoteItems.items)
      if (remoteItems.hasNextPage === false) break
      if (remoteItems.hasNextPage === undefined && remoteItems.items.length < pageLimit) break
      if (page === maxPages - 1) throw new Error(`PostFast inbox item pagination capped at ${maxPages} pages for conversation ${conversation.id}.`)
    }
    for (const item of items.filter((entry) => entry.id)) {
      await prisma.postfastInboxItem.upsert({
        where: { conversationId_providerId: { conversationId: stored.id, providerId: item.id } },
        create: inboxItemData(stored.id, item), update: inboxItemData(stored.id, item),
      })
      syncedItems += 1
    }
    const requiresAttention = conversation.unreadCount > 0 || conversation.needsAttention || items.some((item) => item.unread)
    const existing = pendingByConversationId.get(conversation.id)
    if (requiresAttention) {
      activeConversationIds.add(conversation.id)
      const payload = { providerConversationId: conversation.id, platform: conversation.platform, unreadCount: conversation.unreadCount, needsAttention: conversation.needsAttention }
      const description = `${conversation.participantName || 'Social participant'}: ${conversation.subject || 'Inbox conversation requires attention.'}`
      if (existing) {
        await prisma.actionItem.update({ where: { id: existing.id }, data: { description, payload: payload as Prisma.InputJsonValue } })
      } else {
        await prisma.actionItem.create({
          data: { brandId, accountId: account.id, type: 'social_inbox', priority: conversation.needsAttention ? 'high' : 'normal', title: `Social inbox: ${conversation.platform}`, description, payload: payload as Prisma.InputJsonValue },
        })
        actionItems += 1
      }
    }
  }
  const resolvedActionItemIds = pendingActionItems
    .filter((item: { id: string; payload: unknown }) => {
      const conversationId = (item.payload as { providerConversationId?: unknown } | null)?.providerConversationId
      return typeof conversationId === 'string' && !activeConversationIds.has(conversationId) && !skippedConversationIds.has(conversationId)
    })
    .map((item: { id: string }) => item.id)
  if (resolvedActionItemIds.length > 0) {
    await prisma.actionItem.updateMany({
      where: { id: { in: resolvedActionItemIds }, status: 'pending' },
      data: { status: 'resolved', resolvedAt: new Date(), resolvedNote: 'Inbox conversation no longer has unread messages or needs attention.' },
    })
  }
  return { conversations: conversations.length, items: syncedItems, actionItems }
}

const INCOMPLETE_RESERVATION_LEASE_MS = 60_000

export async function reserveInboxWrite(input: { scope: string; key: string; payload: unknown }) {
  const requestHash = createHash('sha256').update(stableJson(input.payload)).digest('hex')
  const reserveExisting = async (tx: Prisma.TransactionClient) => {
    const existing = await tx.idempotencyRecord.findUnique({ where: { scope_key: { scope: input.scope, key: input.key } } })
    if (!existing) return null
    if (existing.requestHash !== requestHash) return { conflict: true as const }
    if (existing.response !== null || existing.statusCode !== null) {
      return { replay: existing.response as Record<string, unknown> | null }
    }
    const reclaimed = await tx.idempotencyRecord.updateMany({
      where: { id: existing.id, response: { equals: Prisma.DbNull }, statusCode: null, updatedAt: { lte: new Date(Date.now() - INCOMPLETE_RESERVATION_LEASE_MS) } },
      data: { updatedAt: new Date() },
    })
    return reclaimed.count === 1 ? { reserved: true as const } : { pending: true as const }
  }

  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await reserveExisting(tx)
      if (existing) return existing
      await tx.idempotencyRecord.create({ data: { scope: input.scope, key: input.key, requestHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } })
      return { reserved: true as const }
    })
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await reserveExisting(tx)
      return existing ?? { pending: true as const }
    })
  }
}

export async function completeInboxWrite(scope: string, key: string, response: Record<string, unknown>, statusCode: number) {
  await prisma.idempotencyRecord.update({ where: { scope_key: { scope, key } }, data: { response: response as Prisma.InputJsonValue, statusCode } })
}
