import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { postfastFetchAccounts, postfastListPosts } from '@/lib/integrations/postfast'
import { lockAccountBinding, lockBrandSync, SocialAccountBindingError } from '@/lib/socialAccountBinding'
import { sanitizePostfastPoolRecords } from '@/lib/postfastKeyPool'

export async function releasePostfastPoolKey(input: {
  id: string
  expectedBrandId: string
  expectedUpdatedAt: string
  actorId: string
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await lockBrandSync(tx, input.expectedBrandId)
    const key = await tx.postfastApiKeyPool.findUnique({ where: { id: input.id } })
    if (!key) throw new SocialAccountBindingError('PostFast key 不存在。', 404, 'KEY_NOT_FOUND')
    if (key.status === 'AVAILABLE' && !key.assignedBrandId) return sanitizePostfastPoolRecords([key])[0]
    if (key.status !== 'ASSIGNED' || key.assignedBrandId !== input.expectedBrandId || new Date(key.updatedAt).toISOString() !== input.expectedUpdatedAt) {
      throw new SocialAccountBindingError('Key 分配关系已变更，请刷新列表后重试。', 409, 'KEY_ASSIGNMENT_CHANGED')
    }
    const brand = await tx.brand.findUnique({ where: { id: input.expectedBrandId } })
    if (!brand || brand.postfastApiKey !== key.token) {
      throw new SocialAccountBindingError('品牌配置与 key 池分配不一致，请先核对品牌 PostFast 配置。', 409, 'KEY_ASSIGNMENT_CHANGED')
    }
    const otherBrand = await tx.brand.findFirst({ where: { id: { not: brand.id }, postfastApiKey: key.token }, select: { id: true } })
    if (otherBrand) throw new SocialAccountBindingError('这个 key 仍被其他品牌使用，请先核对配置。', 409, 'KEY_SHARED')

    const accounts = await tx.socialAccount.findMany({ where: { brandId: brand.id }, select: { id: true } })
    for (const account of accounts) await lockAccountBinding(tx, account.id)
    const pending = await tx.contentDraft.count({ where: { brandId: brand.id, status: { in: ['scheduled', 'publishing'] } } })
    const jobs = await tx.postfastDeliveryJob.count({ where: { brandId: brand.id, status: { in: ['QUEUED', 'TRANSFERRING', 'CREATING_POST', 'RESULT_UNKNOWN'] } } })
    if (pending || jobs) throw new SocialAccountBindingError('该品牌还有未完成排期或发布任务，请先取消或处理后再解绑回池。', 409, 'KEY_HAS_PENDING_POSTS')

    const remote = await postfastFetchAccounts(key.token, 5_000)
    if (!remote.success) throw new SocialAccountBindingError('无法确认 PostFast 账号状态，请稍后重试；绑定未修改。', 503, 'KEY_STATUS_UNAVAILABLE')
    if (remote.accounts.length) {
      throw new SocialAccountBindingError(`PostFast 工作区仍连接 ${remote.accounts.length} 个社媒账号，请先在 PostFast 解除这些连接，再解绑回池。AMC 的单账号解绑会保留 PostFast 授权。`, 409, 'KEY_HAS_ACCOUNTS')
    }
    const posts = await postfastListPosts(key.token, { status: 'scheduled', page: 0, limit: 1, timeoutMs: 5_000 })
    if (!posts.success) throw new SocialAccountBindingError('无法确认 PostFast 排期状态，请稍后重试；绑定未修改。', 503, 'KEY_STATUS_UNAVAILABLE')
    if (posts.posts.length || (posts.total ?? 0) > 0) throw new SocialAccountBindingError('PostFast 仍有未完成排期，请先处理后再解绑回池。', 409, 'KEY_HAS_PENDING_POSTS')
    if (posts.hasNextPage === true) throw new SocialAccountBindingError('PostFast 排期结果不完整，请稍后重试。', 503, 'KEY_STATUS_UNAVAILABLE')

    // Compare-and-set also protects against configuration edits outside the binding locks.
    const cleared = await tx.brand.updateMany({ where: { id: brand.id, postfastApiKey: key.token }, data: {
      postfastApiKey: null, postfastConnectLink: null, postfastConnectLinkUpdatedAt: null,
      postfastSnapshot: Prisma.DbNull, postfastSyncedAt: null,
    } })
    if (cleared.count !== 1) throw new SocialAccountBindingError('品牌配置已变更，请刷新后重试。', 409, 'KEY_ASSIGNMENT_CHANGED')
    const released = await tx.postfastApiKeyPool.updateMany({ where: {
      id: key.id, status: 'ASSIGNED', assignedBrandId: brand.id, updatedAt: key.updatedAt,
    }, data: { status: 'AVAILABLE', assignedBrandId: null, assignedUserId: null, assignedAt: null } })
    if (released.count !== 1) throw new SocialAccountBindingError('Key 分配关系已变更，请刷新后重试。', 409, 'KEY_ASSIGNMENT_CHANGED')
    await tx.socialAccount.updateMany({ where: { brandId: brand.id, postfastAccountId: { not: null } }, data: { autoPilot: false } })
    await tx.auditLog.create({ data: {
      actorId: input.actorId, actorType: 'HUMAN', action: 'POSTFAST_KEY_POOL_RELEASED',
      resourceId: key.id, resourceType: 'PostfastApiKeyPool',
      oldValue: { status: 'ASSIGNED', assignedBrandId: brand.id },
      newValue: { status: 'AVAILABLE', assignedBrandId: null },
    } })
    const updated = await tx.postfastApiKeyPool.findUnique({ where: { id: key.id } })
    return sanitizePostfastPoolRecords([updated])[0]
  }, { timeout: 20_000, maxWait: 5_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
