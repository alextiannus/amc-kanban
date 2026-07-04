/**
 * syncDraftStatuses — PostFast → ContentDraft status reconciliation
 *
 * PostFast publishes scheduled posts automatically at the scheduled time.
 * Our DB does not receive a webhook — the ContentDraft stays in 'scheduled'
 * status indefinitely unless we actively poll.
 *
 * This function:
 *   1. Finds all ContentDrafts in 'scheduled' status with a platformPostId
 *   2. Queries PostFast for their current status (published / failed)
 *   3. Updates the DB records to match
 *
 * Called by:
 *   - /api/cron/postfast-sync-all  (daily, Phase 4)
 *   - /api/brands/[id]/drafts/sync-statuses  (manual trigger from UI)
 */

import { prisma } from '@/lib/prisma'
import { postfastListPosts } from '@/lib/integrations/postfast'

export interface SyncDraftStatusResult {
  checked: number
  updated: number
  updates: Array<{
    draftId: string
    from: 'scheduled'
    to: 'published' | 'failed'
    publishedAt?: string
  }>
  errors: string[]
}

/**
 * Sync scheduled draft statuses for a single brand.
 * Returns a summary of what was checked and updated.
 */
export async function syncBrandDraftStatuses(
  brandId: string,
  postfastApiKey: string,
): Promise<SyncDraftStatusResult> {
  const result: SyncDraftStatusResult = { checked: 0, updated: 0, updates: [], errors: [] }

  // 1. Find all 'scheduled' drafts that have a platformPostId (i.e. PostFast knows about them)
  const scheduledDrafts = await prisma.contentDraft.findMany({
    where: {
      brandId,
      status: 'scheduled',
      platformPostId: { not: null },
    },
    select: { id: true, platformPostId: true, scheduledAt: true },
  })

  result.checked = scheduledDrafts.length
  if (scheduledDrafts.length === 0) return result

  // 2. Build a lookup set of platformPostIds we care about
  const wantedIds = new Set(scheduledDrafts.map((d: { id: string; platformPostId: string | null; scheduledAt: Date | null }) => d.platformPostId!))


  // 3. Fetch published + failed from PostFast (both may contain our scheduled posts)
  //    PostFast returns newest first — a recently published post will be in the first page (50 items).
  //    We also fetch page 2 for brands that publish heavily.
  const pfStatusMap = new Map<string, { status: 'published' | 'failed'; publishedAt?: string }>()

  const fetchPage = async (status: 'published' | 'failed', page?: number) => {
    try {
      const res = await postfastListPosts(postfastApiKey, { status, limit: 50, page })
      for (const post of res.posts) {
        if (wantedIds.has(post.id)) {
          pfStatusMap.set(post.id, {
            status,
            publishedAt: post.publishedAt,
          })
        }
      }
      // Fetch page 2 if there are more results and first page didn't cover all wanted IDs
      if (page == null && res.total && res.total > 50) {
        await fetchPage(status, 2)
      }
    } catch (e: any) {
      result.errors.push(`PostFast ${status} fetch failed: ${e?.message ?? String(e)}`)
    }
  }

  await Promise.all([fetchPage('published'), fetchPage('failed')])

  // 4. Update DB for any drafts whose PostFast status has changed
  for (const draft of scheduledDrafts) {
    if (!draft.platformPostId) continue
    const pfPost = pfStatusMap.get(draft.platformPostId)
    if (!pfPost) continue // still scheduled in PostFast — no change needed

    try {
      if (pfPost.status === 'published') {
        await prisma.contentDraft.update({
          where: { id: draft.id },
          data: {
            status: 'published',
            publishedAt: pfPost.publishedAt ? new Date(pfPost.publishedAt) : new Date(),
            agentNote: 'PostFast 发布成功，状态已自动同步。',
          },
        })
        result.updates.push({
          draftId: draft.id,
          from: 'scheduled',
          to: 'published',
          publishedAt: pfPost.publishedAt,
        })
      } else if (pfPost.status === 'failed') {
        await prisma.contentDraft.update({
          where: { id: draft.id },
          data: {
            status: 'failed',
            agentNote: 'PostFast 报告发布失败，请检查账号连接状态或重新排期。',
          },
        })
        result.updates.push({ draftId: draft.id, from: 'scheduled', to: 'failed' })
      }
      result.updated++
    } catch (e: any) {
      result.errors.push(`Failed to update draft ${draft.id}: ${e?.message ?? String(e)}`)
    }
  }

  console.log(
    `[syncBrandDraftStatuses] brand=${brandId} checked=${result.checked} updated=${result.updated}`,
    result.updates,
  )
  return result
}
