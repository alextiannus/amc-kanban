/**
 * PostFast -> ContentDraft status reconciliation.
 *
 * PostFast publishes scheduled posts asynchronously and does not currently
 * send this application a webhook. This bounded poll keeps scheduled drafts in
 * sync and also repairs legacy rows created before the official
 * `{ postIds: [...] }` create response was parsed.
 */

import { prisma } from '@/lib/prisma'
import {
  postfastFetchAccounts,
  postfastListPosts,
  type PostFastPost,
} from '@/lib/integrations/postfast'
import { findUniqueLegacyPostMatch } from '@/lib/draftStatusReconciliation'

export interface SyncDraftStatusResult {
  checked: number
  updated: number
  updates: Array<{
    draftId: string
    from: 'scheduled'
    to: 'published' | 'failed'
    publishedAt?: string
    recoveredPostId?: string
  }>
  errors: string[]
}

type ScheduledDraft = {
  id: string
  platformPostId: string | null
  scheduledAt: Date | null
  caption: string
  hashtags: string[]
  account: {
    platformId: string
    handle: string | null
    displayName: string | null
  } | null
}

const PAGE_LIMIT = 50
const MAX_PAGES_PER_STATUS = 20
function normalizeIdentity(value: string | null | undefined) {
  return (value ?? '').trim().replace(/^@/, '').toLocaleLowerCase()
}

function validPublishedAt(value: string | undefined) {
  if (!value) return new Date()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

/**
 * Sync scheduled draft statuses for one brand.
 *
 * Rows with a stored platformPostId use an exact ID match. Legacy rows without
 * an ID are repaired only when one unique provider post matches account,
 * normalized caption and scheduled time (within two minutes).
 */
export async function syncBrandDraftStatuses(
  brandId: string,
  postfastApiKey: string,
): Promise<SyncDraftStatusResult> {
  const result: SyncDraftStatusResult = { checked: 0, updated: 0, updates: [], errors: [] }

  const scheduledDrafts = await prisma.contentDraft.findMany({
    where: {
      brandId,
      status: 'scheduled',
    },
    select: {
      id: true,
      platformPostId: true,
      scheduledAt: true,
      caption: true,
      hashtags: true,
      account: {
        select: {
          platformId: true,
          handle: true,
          displayName: true,
        },
      },
    },
  }) as ScheduledDraft[]

  result.checked = scheduledDrafts.length
  if (scheduledDrafts.length === 0) return result

  const now = Date.now()
  const wantedIds = new Set<string>(
    scheduledDrafts
      .map((draft) => draft.platformPostId)
      .filter((postId): postId is string => Boolean(postId)),
  )
  const hasLegacyDrafts = scheduledDrafts.some(
    (draft) => !draft.platformPostId && draft.scheduledAt && draft.scheduledAt.getTime() <= now,
  )

  const providerPosts: PostFastPost[] = []
  const providerPostsById = new Map<string, PostFastPost>()

  const fetchStatusPages = async (status: 'published' | 'failed') => {
    let page = 0
    try {
      while (page < MAX_PAGES_PER_STATUS) {
        const response = await postfastListPosts(postfastApiKey, {
          status,
          limit: PAGE_LIMIT,
          page,
        })
        if (!response.success) {
          result.errors.push(
            `PostFast ${status} fetch failed on page ${page}: ${response.error ?? 'unknown error'}`,
          )
          return
        }

        for (const rawPost of response.posts) {
          const post: PostFastPost = { ...rawPost, status }
          providerPosts.push(post)
          providerPostsById.set(post.id, post)
        }

        if (
          !hasLegacyDrafts
          && wantedIds.size > 0
          && [...wantedIds].every((postId) => providerPostsById.has(postId))
        ) {
          return
        }

        const noMoreByTotal = typeof response.total === 'number'
          && (page + 1) * PAGE_LIMIT >= response.total
        const noMoreByData = response.posts.length < PAGE_LIMIT
        if (response.hasNextPage === false || noMoreByTotal || noMoreByData) return

        page += 1
      }

      result.errors.push(
        `PostFast ${status} pagination capped at ${MAX_PAGES_PER_STATUS} pages; sync may be partial for brand ${brandId}`,
      )
    } catch (error: unknown) {
      result.errors.push(
        `PostFast ${status} fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  await Promise.all([fetchStatusPages('published'), fetchStatusPages('failed')])

  let providerAccountIds = new Map<string, string>()
  if (hasLegacyDrafts) {
    const accountsResult = await postfastFetchAccounts(postfastApiKey)
    if (accountsResult.success) {
      providerAccountIds = new Map(
        accountsResult.accounts.map((account) => [
          `${normalizeIdentity(account.platformId)}:${normalizeIdentity(account.handle || account.displayName)}`,
          account.id,
        ]),
      )
    } else {
      result.errors.push(
        `PostFast account lookup failed during legacy reconciliation: ${accountsResult.error ?? 'unknown error'}`,
      )
    }
  }

  const claimedProviderIds = new Set<string>()
  const findLegacyMatch = (draft: (typeof scheduledDrafts)[number]) => {
    if (!draft.scheduledAt || draft.scheduledAt.getTime() > now) return undefined

    const accountKey = draft.account
      ? `${normalizeIdentity(draft.account.platformId)}:${normalizeIdentity(
          draft.account.handle || draft.account.displayName,
        )}`
      : ''
    const providerAccountId = accountKey ? providerAccountIds.get(accountKey) : undefined
    const match = findUniqueLegacyPostMatch({
      caption: draft.caption,
      hashtags: draft.hashtags,
      scheduledAt: draft.scheduledAt,
      providerAccountId,
      providerPosts,
      claimedProviderIds,
      now,
    })

    if (match.ambiguousCount > 1) {
      result.errors.push(
        `Skipped ambiguous PostFast recovery for draft ${draft.id}: ${match.ambiguousCount} candidates`,
      )
    }
    return match.post
  }

  for (const draft of scheduledDrafts) {
    const providerPost = draft.platformPostId
      ? providerPostsById.get(draft.platformPostId)
      : findLegacyMatch(draft)
    if (!providerPost) continue

    claimedProviderIds.add(providerPost.id)
    const recoveredPostId = draft.platformPostId ? undefined : providerPost.id
    const resolvedStatus: 'published' | 'failed' = providerPost.status === 'published'
      ? 'published'
      : 'failed'

    try {
      const update = resolvedStatus === 'published'
        ? await prisma.contentDraft.updateMany({
            where: { id: draft.id, status: 'scheduled' },
            data: {
              status: 'published',
              publishedAt: validPublishedAt(providerPost.publishedAt),
              ...(recoveredPostId ? { platformPostId: recoveredPostId } : {}),
              agentNote: 'PostFast 发布成功，状态已自动同步。',
            },
          })
        : await prisma.contentDraft.updateMany({
            where: { id: draft.id, status: 'scheduled' },
            data: {
              status: 'failed',
              ...(recoveredPostId ? { platformPostId: recoveredPostId } : {}),
              agentNote: 'PostFast 报告发布失败，请检查账号连接状态或重新排期。',
            },
          })

      if (update.count === 0) continue

      result.updated += 1
      result.updates.push({
        draftId: draft.id,
        from: 'scheduled',
        to: resolvedStatus,
        ...(providerPost.publishedAt ? { publishedAt: providerPost.publishedAt } : {}),
        ...(recoveredPostId ? { recoveredPostId } : {}),
      })
    } catch (error: unknown) {
      result.errors.push(
        `Failed to update draft ${draft.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  console.log(
    `[syncBrandDraftStatuses] brand=${brandId} checked=${result.checked} updated=${result.updated}`,
    result.updates,
  )
  return result
}
