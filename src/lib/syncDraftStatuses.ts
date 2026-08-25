/**
 * PostFast -> ContentDraft status reconciliation.
 *
 * PostFast publishes scheduled posts asynchronously and does not currently
 * send this application a webhook. This bounded poll keeps both scheduled and
 * publishing drafts in sync and repairs legacy rows created before provider
 * post IDs were stored.
 */

import { prisma } from './prisma.ts'
import { writeAuditLog } from './audit.ts'
import {
  postfastFetchAccounts,
  postfastListPosts,
  type PostFastPost,
} from './integrations/postfast.ts'
import {
  DRAFT_STATUS_RECONCILIATION_GRACE_MS,
  findUniqueLegacyPostMatch,
  isDraftReconciliationStale,
} from './draftStatusReconciliation.ts'

export { DRAFT_STATUS_RECONCILIATION_GRACE_MS }
export const POSTFAST_RESULT_UNKNOWN = 'POSTFAST_RESULT_UNKNOWN'

type ReconciledFromStatus = 'scheduled' | 'publishing'
type ReconciledToStatus = 'scheduled' | 'published' | 'failed'

export interface SyncDraftStatusResult {
  checked: number
  updated: number
  wouldUpdate: number
  published: number
  failed: number
  waiting: number
  unresolved: number
  skipped: number
  providerErrors: number
  dryRun: boolean
  updates: Array<{
    draftId: string
    from: ReconciledFromStatus
    to: ReconciledToStatus
    reason: 'provider_id' | 'legacy_unique' | 'legacy_duplicate_consensus' | 'provider_result_unknown'
    applied: boolean
    publishedAt?: string
    recoveredPostId?: string
    deliveryFailureCode?: string
  }>
  errors: string[]
}

type ReconciliationDraft = {
  id: string
  status: ReconciledFromStatus
  platformPostId: string | null
  scheduledAt: Date | null
  updatedAt: Date
  deliveryFailureCode: string | null
  caption: string
  hashtags: string[]
  account: {
    platformId: string
    handle: string | null
    displayName: string | null
  } | null
}

type SyncDraftStatusOptions = {
  apply?: boolean
  now?: Date
  graceMs?: number
  quiet?: boolean
}

const PAGE_LIMIT = 50
const MAX_PAGES_PER_STATUS = 20
const PROVIDER_STATUSES = ['scheduled', 'published', 'failed'] as const

function normalizeIdentity(value: string | null | undefined) {
  return (value ?? '').trim().replace(/^@/, '').toLocaleLowerCase()
}

function validPublishedAt(value: string | undefined, fallback: Date) {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date
}

function reconciliationAnchor(draft: ReconciliationDraft) {
  return draft.status === 'scheduled'
    ? (draft.scheduledAt ?? draft.updatedAt)
    : draft.updatedAt
}

function resultTemplate(dryRun: boolean): SyncDraftStatusResult {
  return {
    checked: 0,
    updated: 0,
    wouldUpdate: 0,
    published: 0,
    failed: 0,
    waiting: 0,
    unresolved: 0,
    skipped: 0,
    providerErrors: 0,
    dryRun,
    updates: [],
    errors: [],
  }
}

/**
 * Reconcile scheduled/publishing drafts for one brand.
 *
 * A provider read must be complete before any local mutation is made. Rows
 * with a stored provider ID use exact matching. Legacy rows use account,
 * normalized full caption and a two-minute time window. Equivalent duplicate
 * provider records are accepted only when they agree on the final status.
 */
export async function syncBrandDraftStatuses(
  brandId: string,
  postfastApiKey: string,
  options: SyncDraftStatusOptions = {},
): Promise<SyncDraftStatusResult> {
  const apply = options.apply !== false
  const now = options.now ?? new Date()
  const graceMs = options.graceMs ?? DRAFT_STATUS_RECONCILIATION_GRACE_MS
  const result = resultTemplate(!apply)

  const drafts = await prisma.contentDraft.findMany({
    where: {
      brandId,
      status: { in: ['scheduled', 'publishing'] },
    },
    select: {
      id: true,
      status: true,
      platformPostId: true,
      scheduledAt: true,
      updatedAt: true,
      deliveryFailureCode: true,
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
  }) as ReconciliationDraft[]

  result.checked = drafts.length
  if (drafts.length === 0) return result

  const wantedIds = new Set(
    drafts
      .map((draft) => draft.platformPostId)
      .filter((postId): postId is string => Boolean(postId)),
  )
  const hasLegacyDrafts = drafts.some(
    (draft) => !draft.platformPostId && (
      draft.deliveryFailureCode === POSTFAST_RESULT_UNKNOWN
      || reconciliationAnchor(draft).getTime() <= now.getTime()
    ),
  )

  const providerPosts: PostFastPost[] = []
  const providerPostsById = new Map<string, PostFastPost>()
  let providerReadComplete = true

  const fetchStatusPages = async (status: typeof PROVIDER_STATUSES[number]) => {
    let page = 0
    try {
      while (page < MAX_PAGES_PER_STATUS) {
        const response = await postfastListPosts(postfastApiKey, {
          status,
          limit: PAGE_LIMIT,
          page,
        })
        if (!response.success) {
          providerReadComplete = false
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

      providerReadComplete = false
      result.errors.push(
        `PostFast ${status} pagination capped at ${MAX_PAGES_PER_STATUS} pages for brand ${brandId}`,
      )
    } catch (error: unknown) {
      providerReadComplete = false
      result.errors.push(
        `PostFast ${status} fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  await Promise.all(PROVIDER_STATUSES.map((status) => fetchStatusPages(status)))

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
      providerReadComplete = false
      result.errors.push(
        `PostFast account lookup failed during legacy reconciliation: ${accountsResult.error ?? 'unknown error'}`,
      )
    }
  }

  if (!providerReadComplete) {
    result.providerErrors = result.errors.length
    result.skipped = drafts.length
    return result
  }

  const claimedProviderIds = new Set<string>()

  for (const draft of drafts) {
    let providerPost: PostFastPost | undefined
    let reason: SyncDraftStatusResult['updates'][number]['reason'] = 'provider_id'
    let recoveredPostId: string | undefined
    let matchedProviderIds: string[] = []
    let conflictingCandidates = 0

    if (draft.platformPostId) {
      providerPost = providerPostsById.get(draft.platformPostId)
      if (providerPost) matchedProviderIds = [providerPost.id]
    } else if (
      draft.deliveryFailureCode === POSTFAST_RESULT_UNKNOWN
      || reconciliationAnchor(draft).getTime() <= now.getTime()
    ) {
      const accountKey = draft.account
        ? `${normalizeIdentity(draft.account.platformId)}:${normalizeIdentity(
            draft.account.handle || draft.account.displayName,
          )}`
        : ''
      const providerAccountId = accountKey ? providerAccountIds.get(accountKey) : undefined
      const match = findUniqueLegacyPostMatch({
        caption: draft.caption,
        hashtags: draft.hashtags,
        scheduledAt: reconciliationAnchor(draft),
        providerAccountId,
        providerPosts,
        claimedProviderIds,
        now: now.getTime(),
        allowFuture: draft.deliveryFailureCode === POSTFAST_RESULT_UNKNOWN,
      })
      providerPost = match.post
      matchedProviderIds = match.matchedPostIds
      conflictingCandidates = match.post ? 0 : match.ambiguousCount
      if (providerPost) {
        recoveredPostId = providerPost.id
        reason = match.equivalentDuplicateCount > 1
          ? 'legacy_duplicate_consensus'
          : 'legacy_unique'
      }
    }

    if (conflictingCandidates > 1) {
      result.skipped += 1
      result.errors.push(
        `Skipped conflicting PostFast recovery for draft ${draft.id}: ${conflictingCandidates} candidates`,
      )
      continue
    }

    if (!providerPost) {
      if (!isDraftReconciliationStale({
        status: draft.status,
        scheduledAt: draft.scheduledAt,
        updatedAt: draft.updatedAt,
        now,
        graceMs,
      })) {
        result.waiting += 1
        continue
      }

      reason = 'provider_result_unknown'
      result.wouldUpdate += 1
      result.failed += 1
      result.unresolved += 1
      let applied = false
      if (apply) {
        const update = await prisma.contentDraft.updateMany({
          where: { id: draft.id, status: draft.status },
          data: {
            status: 'failed',
            deliveryFailureCode: POSTFAST_RESULT_UNKNOWN,
            deliveryFailureAt: now,
            agentNote: 'PostFast 未返回可确认的发布结果。重新排期前，请先检查对应社交平台确认内容尚未发布。',
          },
        })
        applied = update.count === 1
        if (applied) {
          result.updated += 1
          await writeAuditLog({
            action: 'RECONCILE_DRAFT_STATUS',
            resourceId: draft.id,
            resourceType: 'ContentDraft',
            oldValue: { status: draft.status },
            newValue: { status: 'failed', deliveryFailureCode: POSTFAST_RESULT_UNKNOWN },
            reason: 'PostFast result remained unknown after the 30-minute reconciliation grace period.',
            metadata: { brandId, reconciliationReason: reason },
          })
        } else {
          result.skipped += 1
        }
      }
      result.updates.push({
        draftId: draft.id,
        from: draft.status,
        to: 'failed',
        reason,
        applied,
        deliveryFailureCode: POSTFAST_RESULT_UNKNOWN,
      })
      continue
    }

    matchedProviderIds.forEach((postId) => claimedProviderIds.add(postId))

    const resolvedStatus: ReconciledToStatus = providerPost.status === 'published'
      ? 'published'
      : providerPost.status === 'failed'
        ? 'failed'
        : 'scheduled'

    if (resolvedStatus === 'scheduled' && draft.status === 'scheduled') {
      result.waiting += 1
      continue
    }

    result.wouldUpdate += 1
    if (resolvedStatus === 'published') result.published += 1
    if (resolvedStatus === 'failed') result.failed += 1
    if (resolvedStatus === 'scheduled') result.waiting += 1

    const publishedAt = resolvedStatus === 'published'
      ? validPublishedAt(providerPost.publishedAt, draft.scheduledAt ?? now)
      : undefined
    const failureCode = resolvedStatus === 'failed' ? 'POSTFAST_REPORTED_FAILED' : undefined
    let applied = false

    if (apply) {
      const update = await prisma.contentDraft.updateMany({
        where: { id: draft.id, status: draft.status },
        data: {
          status: resolvedStatus,
          ...(publishedAt ? { publishedAt } : {}),
          ...(providerPost.postUrl ? { postUrl: providerPost.postUrl } : {}),
          ...(recoveredPostId ? { platformPostId: recoveredPostId } : {}),
          deliveryFailureCode: failureCode ?? null,
          deliveryFailureAt: failureCode ? now : null,
          agentNote: resolvedStatus === 'published'
            ? 'PostFast 发布成功，状态已自动同步。'
            : resolvedStatus === 'failed'
              ? 'PostFast 报告发布失败，请检查账号连接状态或重新排期。'
              : 'PostFast 已接受排期，状态已自动同步。',
        },
      })
      applied = update.count === 1
      if (applied) {
        result.updated += 1
        await writeAuditLog({
          action: 'RECONCILE_DRAFT_STATUS',
          resourceId: draft.id,
          resourceType: 'ContentDraft',
          oldValue: { status: draft.status },
          newValue: {
            status: resolvedStatus,
            platformPostId: recoveredPostId ?? draft.platformPostId,
            deliveryFailureCode: failureCode ?? null,
          },
          reason: `PostFast reconciliation: ${reason}`,
          metadata: { brandId, providerPostId: providerPost.id, matchedProviderIds },
        })
      } else {
        result.skipped += 1
      }
    }

    result.updates.push({
      draftId: draft.id,
      from: draft.status,
      to: resolvedStatus,
      reason,
      applied,
      ...(publishedAt ? { publishedAt: publishedAt.toISOString() } : {}),
      ...(recoveredPostId ? { recoveredPostId } : {}),
      ...(failureCode ? { deliveryFailureCode: failureCode } : {}),
    })
  }

  result.providerErrors = result.errors.filter((error) => error.startsWith('PostFast')).length
  if (!options.quiet) {
    console.log(
      `[syncBrandDraftStatuses] brand=${brandId} checked=${result.checked} wouldUpdate=${result.wouldUpdate} updated=${result.updated} dryRun=${result.dryRun}`,
      result.updates,
    )
  }
  return result
}
