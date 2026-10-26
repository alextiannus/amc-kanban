import type { Prisma, SocialAccount } from '@prisma/client'
import { accountPlatform, SocialAccountBindingError } from './socialAccountIdentity.ts'
import { lockAccountBinding, lockBrandSync } from './socialAccountLocks.ts'

export const channelAccountWhere = { unboundAt: null, NOT: { handle: 'unconfigured' } } as const

type PlaceholderIdentity = Pick<SocialAccount, 'handle'> & Partial<Pick<SocialAccount,
  'postfastAccountId' | 'accessToken' | 'refreshToken' | 'loginUsername' | 'loginPassword' | 'profileUrl'>>

export function isPurePlaceholder(account: PlaceholderIdentity) {
  return account.handle === 'unconfigured' &&
    ['postfastAccountId', 'accessToken', 'refreshToken', 'loginUsername', 'loginPassword', 'profileUrl']
      .every(key => !(account as Record<string, unknown>)[key])
}

export function draftPlatform(value: string) {
  const normalized = accountPlatform(value.trim())
  if (['ig', 'ins'].includes(normalized)) return 'instagram'
  if (normalized === 'fb') return 'facebook'
  if (normalized === 'tt') return 'tiktok'
  if (['red', 'xhs', 'rednote', 'redbook'].includes(normalized)) return 'xiaohongshu'
  return normalized
}

export function placeholderDisplayName(platform: string) {
  const id = draftPlatform(platform)
  const names: Record<string, string> = { google: 'Google Business', xiaohongshu: '小红书 / Rednote', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' }
  return `${names[id] || id}（未配置）`
}

export function uniqueConnectedDraftAccount(accounts: SocialAccount[], platform: string) {
  const real = accounts.filter(a => !a.unboundAt && a.handle !== 'unconfigured' && draftPlatform(a.platformId) === draftPlatform(platform))
  if (real.length !== 1) return null
  const account = real[0]
  return account.postfastAccountId && account.connectionStatus === 'CONNECTED' && !account.disabledReason ? account : null
}

/** The caller must persist its draft in this same transaction. */
export async function resolveDraftPlatformAccount(tx: Prisma.TransactionClient, brandId: string, platform: string, preferConnected = true) {
  await lockBrandSync(tx, brandId, true)
  const platformId = draftPlatform(platform)
  if (!platformId) throw new SocialAccountBindingError('Platform is required', 400, 'INVALID_PLATFORM')
  const accounts = await tx.socialAccount.findMany({ where: { brandId } })
  const real = preferConnected ? uniqueConnectedDraftAccount(accounts, platformId) : null
  if (real) {
    await lockAccountBinding(tx, real.id)
    return real
  }
  const placeholders = accounts.filter(a => a.handle === 'unconfigured' && draftPlatform(a.platformId) === platformId)
  if (placeholders.some(a => !isPurePlaceholder(a))) throw new SocialAccountBindingError('占位账号混有授权身份，请先核对账号。', 409, 'PLACEHOLDER_IDENTITY_CONFLICT')
  const existing = placeholders.sort((a, b) => Number(Boolean(a.unboundAt)) - Number(Boolean(b.unboundAt)) || a.id.localeCompare(b.id))[0]
  if (existing) {
    await lockAccountBinding(tx, existing.id)
    // Only internal draft placeholders may be reused. Real-account tombstones
    // are never restored by draft saves, cron or MCP.
    if (existing.autoPilot || existing.unboundAt) return tx.socialAccount.update({ where: { id: existing.id }, data: { autoPilot: false, unboundAt: null } })
    return existing
  }
  return tx.socialAccount.upsert({
    where: { brandId_platformId_handle: { brandId, platformId, handle: 'unconfigured' } },
    create: { brandId, platformId, handle: 'unconfigured', displayName: placeholderDisplayName(platformId), autoPilot: false },
    update: { autoPilot: false },
  })
}

export async function resolveDraftAccount(tx: Prisma.TransactionClient, brandId: string, accountId: string, preferConnected = true) {
  await lockBrandSync(tx, brandId, true)
  if (accountId.startsWith('unconfigured_')) return resolveDraftPlatformAccount(tx, brandId, accountId.slice('unconfigured_'.length), preferConnected)
  await lockAccountBinding(tx, accountId)
  const account = await tx.socialAccount.findFirst({ where: { id: accountId, brandId, unboundAt: null } })
  if (!account) throw new SocialAccountBindingError('accountId is invalid for this brand', 400, 'ACCOUNT_NOT_FOUND')
  if (account.handle === 'unconfigured') {
    if (!isPurePlaceholder(account)) throw new SocialAccountBindingError('占位账号混有授权身份，请先核对账号。', 409, 'PLACEHOLDER_IDENTITY_CONFLICT')
    // A concrete ID remains an explicit selection, including historical records.
    if (account.autoPilot) return tx.socialAccount.update({ where: { id: accountId }, data: { autoPilot: false } })
  }
  return account
}

export const migratablePlaceholderDraftWhere = (brandId: string, accountId: string) => ({
  brandId, accountId, status: 'draft', scheduledAt: null, publishedAt: null,
  platformPostId: null, postUrl: null,
  postfastDeliveryJobs: { none: {} }, actionItem: { is: null },
})

export async function placeholderReferences(tx: Prisma.TransactionClient, brandId: string, accountId: string) {
  const [drafts, actions, snapshots, conversations, imports, jobs] = await Promise.all([
    tx.contentDraft.count({ where: { accountId } }),
    tx.actionItem.count({ where: { accountId } }),
    tx.socialAccountSnapshot.count({ where: { accountId } }),
    tx.postfastInboxConversation.count({ where: { accountId } }),
    tx.googleBrandImport.count({ where: { socialAccountId: accountId } }),
    tx.postfastDeliveryJob.count({ where: { brandId, payload: { path: ['publish', 'accountId'], equals: accountId } } }),
  ])
  // These optional AI tables use logical account references rather than Prisma
  // foreign keys. Retain both active configuration and historical run identity.
  const tables = await tx.$queryRaw<Array<{ settings: string | null; runs: string | null }>>`SELECT to_regclass('amc_iaic.autopilot_settings')::text AS settings, to_regclass('amc_iaic.autopilot_runs')::text AS runs`
  const nativeSettings = tables[0]?.settings
    ? (await tx.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM amc_iaic.autopilot_settings WHERE account_id = ${accountId}`)[0].count : 0
  const nativeRuns = tables[0]?.runs
    ? (await tx.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM amc_iaic.autopilot_runs WHERE account_id = ${accountId}`)[0].count : 0
  return { drafts, actions, snapshots, conversations, imports, jobs, nativeSettings, nativeRuns }
}

/** Disabling a draft placeholder never requires provider access or deletes history. */
export async function disablePlaceholderAutopilot(tx: Prisma.TransactionClient, brandId: string, apply: boolean, reason: string) {
  await lockBrandSync(tx, brandId)
  const accounts = await tx.socialAccount.findMany({ where: { brandId, handle: 'unconfigured' }, orderBy: { id: 'asc' } })
  const disabledAccountIds: string[] = []
  for (const account of accounts) {
    if (!account.autoPilot) continue
    await lockAccountBinding(tx, account.id)
    if (apply) {
      const changed = await tx.socialAccount.updateMany({ where: { id: account.id, brandId, handle: 'unconfigured', autoPilot: true }, data: { autoPilot: false } })
      if (changed.count !== 1) throw new SocialAccountBindingError('Account changed during maintenance', 409, 'ACCOUNT_BUSY')
      await tx.auditLog.create({ data: {
        actorType: 'SYSTEM', action: 'SOCIAL_ACCOUNT_PLACEHOLDER_DISABLED', resourceType: 'SocialAccount', resourceId: account.id,
        oldValue: { autoPilot: true }, newValue: { autoPilot: false }, metadata: { brandId, reason, publish: false },
      } })
    }
    disabledAccountIds.push(account.id)
  }
  return disabledAccountIds
}

export async function reconcilePlaceholderAccounts(tx: Prisma.TransactionClient, brandId: string, apply = true, providerAccountIds?: ReadonlySet<string>) {
  await lockBrandSync(tx, brandId)
  const accounts = await tx.socialAccount.findMany({ where: { brandId } })
  const report: Array<{ accountId: string; targetAccountId: string | null; migratedDraftIds: string[]; deleted: boolean; reasons: string[] }> = []
  for (const original of accounts.filter(a => a.handle === 'unconfigured').sort((a, b) => a.id.localeCompare(b.id))) {
    const entry = { accountId: original.id, targetAccountId: null as string | null, migratedDraftIds: [] as string[], deleted: false, reasons: [] as string[] }
    report.push(entry)
    if (!isPurePlaceholder(original)) {
      entry.reasons.push('mixed_identity')
      if (apply) {
        await lockAccountBinding(tx, original.id)
        if (original.autoPilot) await tx.socialAccount.update({ where: { id: original.id }, data: { autoPilot: false } })
        const previous = await tx.auditLog.findFirst({ where: { resourceId: original.id, action: 'SOCIAL_ACCOUNT_PLACEHOLDER_DISABLED' }, select: { id: true } })
        if (original.autoPilot || !previous) await tx.auditLog.create({ data: { actorType: 'SYSTEM', action: 'SOCIAL_ACCOUNT_PLACEHOLDER_DISABLED', resourceType: 'SocialAccount', resourceId: original.id, oldValue: { autoPilot: original.autoPilot }, newValue: { autoPilot: false }, metadata: { brandId, skippedReasons: entry.reasons, publish: false } } })
      }
      continue
    }
    const connectedTarget = original.unboundAt ? null : uniqueConnectedDraftAccount(accounts, original.platformId)
    const target = connectedTarget && (!providerAccountIds || providerAccountIds.has(connectedTarget.postfastAccountId!)) ? connectedTarget : null
    if (connectedTarget && !target) entry.reasons.push('provider_account_missing')
    for (const id of [original.id, ...(target ? [target.id] : [])].sort()) await lockAccountBinding(tx, id)
    if (apply) await tx.$queryRaw`SELECT id FROM "SocialAccount" WHERE id = ${original.id} AND "brandId" = ${brandId} FOR UPDATE`
    const current = await tx.socialAccount.findFirst({ where: { id: original.id, brandId } })
    if (!current || !isPurePlaceholder(current)) { entry.reasons.push('identity_changed'); continue }
    if (apply && current.autoPilot) await tx.socialAccount.update({ where: { id: current.id }, data: { autoPilot: false } })
    if (target) {
      const freshAccounts = await tx.socialAccount.findMany({ where: { brandId } })
      const freshTarget = uniqueConnectedDraftAccount(freshAccounts, current.platformId)
      if (freshTarget?.id !== target.id) throw new SocialAccountBindingError('账号身份已变化，请重新同步。', 409, 'ACCOUNT_BUSY')
      entry.targetAccountId = target.id
      // Foreign-key writers must wait for the row lock; then re-check all
      // relations and status under that lock before moving a draft.
      if (apply) await tx.$queryRaw`SELECT id FROM "ContentDraft" WHERE "accountId" = ${current.id} AND "brandId" = ${brandId} ORDER BY id FOR UPDATE`
      const drafts = await tx.contentDraft.findMany({ where: migratablePlaceholderDraftWhere(brandId, current.id), select: { id: true }, orderBy: { id: 'asc' } })
      for (const draft of drafts) {
        if (apply) {
          const moved = await tx.contentDraft.updateMany({ where: { id: draft.id, ...migratablePlaceholderDraftWhere(brandId, current.id) }, data: { accountId: target.id } })
          if (moved.count !== 1) throw new SocialAccountBindingError('草稿状态已变化，请重新同步。', 409, 'ACCOUNT_BUSY')
        }
        entry.migratedDraftIds.push(draft.id)
      }
    } else entry.reasons.push(current.unboundAt ? 'unbound_placeholder' : 'no_unique_connected_account')
    const refs = await placeholderReferences(tx, brandId, current.id)
    const remaining = { ...refs, drafts: refs.drafts - (apply ? 0 : entry.migratedDraftIds.length) }
    entry.reasons.push(...Object.entries(remaining).filter(([, count]) => count > 0).map(([key]) => `has_${key}`))
    if (!current.unboundAt && Object.values(remaining).every(count => count === 0)) {
      if (apply) {
        const removed = await tx.socialAccount.deleteMany({ where: { id: current.id, brandId, unboundAt: null, drafts: { none: {} }, actionItems: { none: {} }, snapshots: { none: {} }, inboxConversations: { none: {} } } })
        if (removed.count !== 1) throw new SocialAccountBindingError('占位记录关联已变化，请重新同步。', 409, 'ACCOUNT_BUSY')
      }
      entry.deleted = true
    }
    // Audit actual changes and actionable skips. An unchanged repeated sync
    // must not keep creating identical audit records.
    const previousSkip = apply && !current.autoPilot && !entry.migratedDraftIds.length && !entry.deleted && entry.reasons.length
      ? await tx.auditLog.findFirst({ where: { resourceId: current.id, action: 'SOCIAL_ACCOUNT_PLACEHOLDER_RECONCILED' }, orderBy: { timestamp: 'desc' }, select: { metadata: true } })
      : null
    const unchangedSkip = previousSkip && JSON.stringify((previousSkip.metadata as any)?.skippedReasons) === JSON.stringify(entry.reasons)
    if (apply && (current.autoPilot || entry.migratedDraftIds.length || entry.deleted || (entry.reasons.length && !unchangedSkip))) await tx.auditLog.create({ data: {
      actorType: 'SYSTEM', action: 'SOCIAL_ACCOUNT_PLACEHOLDER_RECONCILED', resourceType: 'SocialAccount', resourceId: current.id,
      oldValue: { autoPilot: current.autoPilot, accountId: current.id }, newValue: { autoPilot: false, ...entry }, metadata: { brandId, platformId: current.platformId, migratedCount: entry.migratedDraftIds.length, skippedReasons: entry.reasons, remainingReferences: remaining, publish: false },
    } })
  }
  return report
}
