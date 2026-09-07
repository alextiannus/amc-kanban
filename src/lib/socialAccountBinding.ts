import { prisma } from './prisma.ts'
import { postfastFetchAccounts, postfastListPosts, type PostFastAccount } from './integrations/postfast.ts'
import { accountPlatform, assertAccountBound, localForProvider, providerForLocal, sameLegacyAccount, uniqueAccount, SocialAccountBindingError } from './socialAccountIdentity.ts'

export { assertAccountBound, SocialAccountBindingError } from './socialAccountIdentity.ts'

export async function saveSocialAccount(brandId: string, data: { platformId: string; handle: string; [key: string]: unknown }, restore = false, actorId?: string) {
  return prisma.$transaction(async (tx: any) => {
    await lockBrandSync(tx, brandId)
    const identity = { id: '', platformId: accountPlatform(data.platformId), handle: data.handle.trim(), profileUrl: data.profileUrl as string | null }
    const locals = await tx.socialAccount.findMany({ where: { brandId } })
    const existing = uniqueAccount<any>(locals.filter((a: any) => sameLegacyAccount(a, identity)))
    if (!existing) return tx.socialAccount.create({ data: { ...data, platformId: identity.platformId, handle: identity.handle, brandId } })
    await lockAccountBinding(tx, existing.id)
    if (existing.unboundAt && !restore) throw new SocialAccountBindingError('该账号已解除绑定，请通过“绑定新账号”显式恢复。', 409, 'ACCOUNT_UNBOUND')
    const saved = await tx.socialAccount.update({ where: { id: existing.id }, data: {
      ...data, platformId: identity.platformId, handle: identity.handle,
      ...(existing.unboundAt && restore ? { unboundAt: null, autoPilot: false } : {}),
    } })
    if (existing.unboundAt && restore) await tx.auditLog.create({ data: {
      actorId, actorType: 'HUMAN', action: 'SOCIAL_ACCOUNT_REBOUND', resourceType: 'SocialAccount', resourceId: existing.id,
      oldValue: { unboundAt: existing.unboundAt.toISOString() }, newValue: { unboundAt: null, autoPilot: false }, metadata: { brandId },
    } })
    return saved
  })
}

// Transaction-scoped advisory locks work across web and cron processes. Never use
// session locks on a pooled connection. Network requests below have bounded timeouts.
export async function lockAccountBinding(tx: any, accountId: string) {
  const rows = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended(${`social-account:${accountId}`}, 0)) AS locked`
  if (!rows[0]?.locked) throw new SocialAccountBindingError('该账号正在同步或发布，请稍后重试。', 409, 'ACCOUNT_BUSY')
}

async function lockBrandSync(tx: any, brandId: string) {
  const rows = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended(${`social-account-sync:${brandId}`}, 0)) AS locked`
  if (!rows[0]?.locked) throw new SocialAccountBindingError('账号绑定正在更新，请稍后重试。', 409, 'ACCOUNT_BUSY')
}

export async function withBoundAccount<T>(accountId: string, work: (account: any, tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx: any) => {
    await lockAccountBinding(tx, accountId)
    const account = await tx.socialAccount.findUnique({ where: { id: accountId } })
    assertAccountBound(account)
    return work(account, tx)
  }, { timeout: 60_000, maxWait: 5_000 })
}

/** All PostFast snapshot writers share identity matching and preserve tombstones. */
export async function syncSocialAccountBindings(brandId: string, remotes: PostFastAccount[]) {
  return prisma.$transaction(async (tx: any) => {
    await lockBrandSync(tx, brandId)
    const locals = await tx.socialAccount.findMany({ where: { brandId } })
    const seen = new Set<string>()
    for (const remote of remotes) {
      if (!remote.id || !remote.platformId || !remote.handle) throw new SocialAccountBindingError('PostFast 返回了不完整的账号身份，未更新绑定。')
      if (seen.has(remote.id)) throw new SocialAccountBindingError('PostFast 返回了重复的账号身份，未更新绑定。')
      seen.add(remote.id)
      const local = localForProvider(locals, remote)
      const data = {
        postfastAccountId: remote.id,
        platformId: accountPlatform(remote.platformId),
        handle: remote.handle,
        displayName: remote.displayName ?? remote.handle,
        profileUrl: remote.profileUrl ?? null,
        followerCount: remote.followerCount ?? null,
        followerDelta: remote.followerDelta ?? 0,
        ratingScore: remote.ratingScore ?? null,
        snapshotAt: new Date(),
      }
      if (local) {
        await lockAccountBinding(tx, local.id)
        // Preserve even the display identity of an unbound account for its history.
        const updated = await tx.socialAccount.update({ where: { id: local.id }, data: local.unboundAt ? { postfastAccountId: remote.id } : data })
        Object.assign(local, updated)
      } else {
        const created = await tx.socialAccount.create({ data: { ...data, brandId } })
        locals.push(created)
      }
    }
    // Only prune empty legacy records. Historical references and unbound records
    // are never cascade-deleted by a snapshot refresh.
    const brand = await tx.brand.findUnique({ where: { id: brandId }, select: { googlePreferOAuth: true, googleRefreshToken: true, googleLocationId: true } })
    for (const local of locals) {
      if (local.unboundAt || (accountPlatform(local.platformId) === 'google' && brand?.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId)) continue
      if (providerForLocal(local, remotes)) continue
      await lockAccountBinding(tx, local.id)
      await tx.socialAccount.deleteMany({ where: { id: local.id, unboundAt: null, drafts: { none: {} }, actionItems: { none: {} }, snapshots: { none: {} } } })
    }
    return tx.socialAccount.findMany({ where: { brandId, unboundAt: null }, select: {
      id: true, platformId: true, handle: true, displayName: true, followerCount: true,
      followerDelta: true, ratingScore: true, snapshotAt: true, profileUrl: true, autoPilot: true,
    } })
  }, { timeout: 30_000 })
}

export async function resolveLocalPublishAccount(input: { apiKey: string; platform: string; accountId?: string; brandId?: string }, remotes: PostFastAccount[]) {
  const brands = await prisma.brand.findMany({ where: { postfastApiKey: input.apiKey, ...(input.brandId ? { id: input.brandId } : {}) }, select: { id: true } })
  const brand = uniqueAccount<{ id: string }>(brands)
  if (!brand) throw new SocialAccountBindingError('找不到当前品牌的有效账号配置。')
  const locals = await prisma.socialAccount.findMany({ where: { brandId: brand.id } })
  let local: any
  if (input.accountId) {
    local = uniqueAccount<any>(locals.filter((a: any) => a.id === input.accountId || a.postfastAccountId === input.accountId))
    if (!local) {
      const remote = remotes.find(a => a.id === input.accountId)
      if (remote) local = localForProvider(locals, remote)
    }
  } else {
    local = uniqueAccount(locals.filter((a: any) => !a.unboundAt && a.handle !== 'unconfigured' && accountPlatform(a.platformId) === accountPlatform(input.platform)))
  }
  assertAccountBound(local)
  if (accountPlatform(local.platformId) !== accountPlatform(input.platform)) throw new SocialAccountBindingError('账号与所选发布平台不匹配。')
  const remote = providerForLocal(local, remotes)
  if (!remote) throw new SocialAccountBindingError('未找到该账号对应的 PostFast 身份，请核对绑定并同步账号。')
  return { local, remote }
}

export async function unbindSocialAccount(brandId: string, accountId: string, actorId: string) {
  return prisma.$transaction(async (tx: any) => {
    await lockBrandSync(tx, brandId)
    await lockAccountBinding(tx, accountId)
    const account = await tx.socialAccount.findFirst({ where: { id: accountId, brandId } })
    if (!account) throw new SocialAccountBindingError('Account not found', 404, 'ACCOUNT_NOT_FOUND')
    if (account.unboundAt) return { ok: true }
    const pending = await tx.contentDraft.count({ where: { brandId, accountId, OR: [
      { status: { in: ['scheduled', 'publishing'] } },
      { postfastDeliveryJobs: { some: { status: { in: ['QUEUED', 'TRANSFERRING', 'CREATING_POST', 'RESULT_UNKNOWN'] } } } },
    ] } })
    if (pending) throw new SocialAccountBindingError('该账号还有未完成排期或发布任务，请先取消或处理后再解除绑定。', 409, 'ACCOUNT_HAS_PENDING_POSTS')
    const brand = await tx.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true } })
    let remoteId = account.postfastAccountId
    if (brand?.postfastApiKey) {
      const fetched = await postfastFetchAccounts(brand.postfastApiKey, 5_000)
      if (!fetched.success) throw new SocialAccountBindingError('无法确认 PostFast 账号状态，请稍后重试。', 503, 'ACCOUNT_STATUS_UNAVAILABLE')
      const remote = providerForLocal(account, fetched.accounts)
      remoteId = remote?.id ?? remoteId
      // If no stable identity can be recovered, do not guess by platform.
      if (!remoteId) throw new SocialAccountBindingError('无法确认该账号的 PostFast 身份，请先同步并核对账号。', 409, 'ACCOUNT_IDENTITY_UNRESOLVED')
      let complete = false
      const seen = new Set<string>()
      for (let page = 0; page < 20; page++) {
        const result = await postfastListPosts(brand.postfastApiKey, { status: 'scheduled', limit: 50, page, timeoutMs: 2_000 })
        if (!result.success) throw new SocialAccountBindingError('无法确认 PostFast 排期状态，请稍后重试。', 503, 'ACCOUNT_STATUS_UNAVAILABLE')
        for (const post of result.posts) {
          if (!post.id || !post.socialMediaId) throw new SocialAccountBindingError('PostFast 排期缺少账号身份，暂时无法安全解绑。', 503, 'ACCOUNT_STATUS_UNAVAILABLE')
          if (post.socialMediaId === remoteId) throw new SocialAccountBindingError('该账号在 PostFast 还有未完成排期，请先取消或处理后再解除绑定。', 409, 'ACCOUNT_HAS_PENDING_POSTS')
          if (seen.has(post.id)) throw new SocialAccountBindingError('PostFast 排期分页未能完整核对，请稍后重试。', 503, 'ACCOUNT_STATUS_UNAVAILABLE')
          seen.add(post.id)
        }
        if (result.hasNextPage === false || (result.hasNextPage === undefined && ((result.total !== undefined && seen.size >= result.total) || (result.total === undefined && result.posts.length < 50)))) { complete = true; break }
      }
      if (!complete) throw new SocialAccountBindingError('PostFast 排期尚未核对完成，请稍后重试。', 503, 'ACCOUNT_STATUS_UNAVAILABLE')
    } else if (remoteId) {
      throw new SocialAccountBindingError('PostFast 配置不可用，无法确认排期状态。', 503, 'ACCOUNT_STATUS_UNAVAILABLE')
    }
    const unboundAt = new Date()
    await tx.socialAccount.update({ where: { id: accountId }, data: { unboundAt, autoPilot: false, postfastAccountId: remoteId } })
    await tx.auditLog.create({ data: { actorId, actorType: 'HUMAN', action: 'SOCIAL_ACCOUNT_UNBOUND', resourceType: 'SocialAccount', resourceId: accountId,
      oldValue: { autoPilot: account.autoPilot, unboundAt: null }, newValue: { unboundAt: unboundAt.toISOString(), autoPilot: false }, metadata: { brandId, platformId: account.platformId, handle: account.handle } } })
    return { ok: true }
  }, { timeout: 55_000, maxWait: 5_000 })
}
