import { createHash } from 'node:crypto'
import { prisma } from '../prisma'
import type { AuthPrincipal } from '../auth-v2/types'
import { monthWindow, selectSubscription, subscriptionState, type SubscriptionSummary } from './policy'

export class OperationsError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
type Person = { id: string; nickname: string | null; email: string }
type Member = { id: string; userId: string; role: string; active: boolean; updatedAt: Date; user: Person }
type Account = { id: string; platformId: string; handle: string; displayName: string | null; profileUrl: string | null; followerCount: number | null; followerDelta: number | null; ratingScore: number | null; snapshotAt: Date | null; connectionStatus: string; disabledReason: string | null }
type BrandRow = { id: string; name: string; location: string | null; status: string; subscriptions: SubscriptionSummary[]; crew: { members: Member[] } | null; accounts: Account[] }
const personSelect = { id: true, nickname: true, email: true }
const memberSelect = { id: true, userId: true, role: true, active: true, updatedAt: true, user: { select: personSelect } }
export const assignmentVersion = (members: Member[]) => createHash('sha256').update(JSON.stringify(
  members.map(m => [m.id, m.userId, m.role, m.active, new Date(m.updatedAt).toISOString()]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
)).digest('hex')

const hasPublicProfile = (value: string | null) => {
  if (!value) return false
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}
const accountConnected = (account: Account) => !account.disabledReason && !['DISABLED', 'DISCONNECTED', 'ERROR', 'EXPIRED'].includes(account.connectionStatus.toUpperCase())
export function accountHealth(accounts: Account[], monthlyPublished: number) {
  if (!accounts.length) return { totalAccounts: 0, linkedAccounts: 0, followers: 0, followerDelta: 0, disabledAccounts: 0, healthScore: 0, healthStatus: 'ATTENTION' as const }
  const linkedAccounts = accounts.filter(a => hasPublicProfile(a.profileUrl)).length
  const disabledAccounts = accounts.filter(a => !accountConnected(a)).length
  const followerDelta = accounts.reduce((sum, a) => sum + (a.followerDelta || 0), 0)
  const connection = ((accounts.length - disabledAccounts) / accounts.length) * 30
  const links = (linkedAccounts / accounts.length) * 15
  const activity = Math.min(1, monthlyPublished / (accounts.length * 4)) * 40
  const trend = followerDelta > 0 ? 15 : followerDelta < 0 ? 0 : 8
  const healthScore = Math.round(connection + links + activity + trend)
  return { totalAccounts: accounts.length, linkedAccounts,
    followers: accounts.reduce((sum, a) => sum + (a.followerCount || 0), 0), followerDelta, disabledAccounts, healthScore,
    healthStatus: healthScore < 60 || disabledAccounts > 0 ? 'ATTENTION' as const : 'HEALTHY' as const }
}

export async function listOperations(actor: AuthPrincipal, params: URLSearchParams, db = prisma, now = new Date()) {
  const admin = actor.globalRoles.includes('ADMIN')
  let scope: string[] | undefined
  if (!admin) {
    // Same direct + organization-owner scope as Auth V2, without one query per brand.
    const users = await db.user.findMany({ where: { id: { in: [actor.userId, actor.linkedHumanUserId || ''] }, status: 'ACTIVE' }, select: {
      crewMemberships: { where: { active: true }, select: { crew: { select: { brandId: true } } } },
      organizationsJoined: { select: { owner: { select: { crewMemberships: { where: { active: true }, select: { crew: { select: { brandId: true } } } } } } } },
    } })
    scope = [...new Set<string>(users.flatMap((u: { crewMemberships: { crew: { brandId: string } }[]; organizationsJoined: { owner: { crewMemberships: { crew: { brandId: string } }[] } }[] }) => [
      ...u.crewMemberships.map(m => m.crew.brandId), ...u.organizationsJoined.flatMap(o => o.owner.crewMemberships.map(m => m.crew.brandId)),
    ]))]
  }
  const subscribedBrands: BrandRow[] = await db.brand.findMany({ where: { status: { not: 'ARCHIVED' }, subscriptions: { some: {} }, ...(scope ? { id: { in: scope } } : {}) }, select: {
    id: true, name: true, location: true, status: true,
    subscriptions: { select: { id: true, planName: true, status: true, feeWaived: true, contractStartDate: true, contractEndDate: true, createdAt: true } },
    crew: { select: { members: { select: memberSelect } } },
    accounts: { where: { unboundAt: null }, select: { id: true, platformId: true, handle: true, displayName: true, profileUrl: true, followerCount: true, followerDelta: true, ratingScore: true, snapshotAt: true, connectionStatus: true, disabledReason: true }, orderBy: [{ platformId: 'asc' }, { id: 'asc' }] },
  } })
  // Select the current contract first: historical paid records must not revive a waived brand.
  const brands = subscribedBrands.filter(b => !selectSubscription(b.subscriptions, now).feeWaived)
  const ids = brands.map(b => b.id)
  const period = monthWindow(now)
  type Count = { brandId: string; accountId?: string | null; _count: { _all: number }; _max?: { publishedAt: Date | null } }
  type AccountCount = { accountId: string | null; _count?: { _all: number }; _max?: { publishedAt: Date | null } }
  const accountIds = brands.flatMap(b => (b.accounts || []).map(a => a.id))
  const [monthly, latest, accountMonthly, accountLatest, candidates]: [Count[], Count[], AccountCount[], AccountCount[], Person[]] = await Promise.all([
    ids.length ? db.contentDraft.groupBy({ by: ['brandId'], where: { brandId: { in: ids }, status: 'published', publishedAt: { gte: period.start, lte: period.end } }, _count: { _all: true } }) : [],
    ids.length ? db.contentDraft.groupBy({ by: ['brandId'], where: { brandId: { in: ids }, status: 'published', publishedAt: { lte: now } }, _max: { publishedAt: true } }) : [],
    accountIds.length ? db.contentDraft.groupBy({ by: ['accountId'], where: { accountId: { in: accountIds }, status: 'published', publishedAt: { gte: period.start, lte: period.end } }, _count: { _all: true } }) : [],
    accountIds.length ? db.contentDraft.groupBy({ by: ['accountId'], where: { accountId: { in: accountIds }, status: 'published', publishedAt: { lte: now } }, _max: { publishedAt: true } }) : [],
    admin ? db.user.findMany({ where: { status: 'ACTIVE', businessRoles: { some: { role: 'AMC_PRINCIPAL' } } }, select: personSelect, orderBy: [{ nickname: 'asc' }, { id: 'asc' }] }) : [],
  ])
  const counts = new Map(monthly.map(r => [r.brandId, r._count._all]))
  const dates = new Map(latest.map(r => [r.brandId, r._max?.publishedAt || null]))
  const accountCounts = new Map(accountMonthly.filter(r => r.accountId).map(r => [r.accountId as string, r._count?._all || 0]))
  const accountDates = new Map(accountLatest.filter(r => r.accountId).map(r => [r.accountId as string, r._max?.publishedAt || null]))
  const all = brands.map(b => {
    const sub = selectSubscription(b.subscriptions, now)
    const members = b.crew?.members || []
    const socialAccounts = (b.accounts || []).map(account => ({ ...account, monthlyPublished: accountCounts.get(account.id) || 0, lastPublishedAt: accountDates.get(account.id) || null }))
    const monthlyPublished = counts.get(b.id) || 0
    return { id: b.id, name: b.name, location: b.location, status: b.status,
      subscription: { ...sub, effectiveStatus: subscriptionState(sub, now) },
      owners: members.filter(m => m.active && m.role === 'OWNER').map(m => m.user),
      principals: members.filter(m => m.active && m.role === 'PRINCIPAL').map(m => m.user),
      assignmentVersion: admin ? assignmentVersion(members) : undefined,
      socialAccounts, accountSummary: accountHealth(b.accounts || [], monthlyPublished),
      monthlyPublished, lastPublishedAt: dates.get(b.id) || null,
    }
  })
  const principalOptions = [...new Map(all.flatMap(b => b.principals).map(p => [p.id, p])).values()]
  const query = (params.get('q') || '').trim().toLocaleLowerCase().slice(0, 200)
  const status = params.get('status') || ''
  const principalId = params.get('principalId') || ''
  const rows = all.filter(b => (!status || b.subscription.effectiveStatus === status) &&
    (!principalId || (principalId === 'unassigned' ? !b.principals.length : b.principals.some(p => p.id === principalId))) &&
    (!query || [b.name, b.location, b.subscription.planName, ...[...b.owners, ...b.principals].flatMap(p => [p.nickname, p.email]), ...b.socialAccounts.flatMap(a => [a.platformId, a.handle, a.displayName])].some(v => v?.toLocaleLowerCase().includes(query))))
  const sort = params.get('sort') || 'expiry'
  rows.sort((a, b) => {
    if (sort === 'published') return b.monthlyPublished - a.monthlyPublished || a.id.localeCompare(b.id)
    if (sort === 'name') return a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
    const aEnd = a.subscription.contractEndDate ? new Date(a.subscription.contractEndDate).getTime() : Number.MAX_SAFE_INTEGER
    const bEnd = b.subscription.contractEndDate ? new Date(b.subscription.contractEndDate).getTime() : Number.MAX_SAFE_INTEGER
    return aEnd - bEnd || a.id.localeCompare(b.id)
  })
  const pageSize = 25
  const total = rows.length
  const page = Math.min(Math.max(1, Math.floor(Number(params.get('page')) || 1)), Math.max(1, Math.ceil(total / pageSize)))
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, canManage: admin, candidates, principalOptions,
    period: { start: period.start.toISOString(), end: period.end.toISOString(), timezone: 'Asia/Singapore' },
    summary: { brands: all.length, active: all.filter(b => b.subscription.effectiveStatus === 'ACTIVE').length,
      expiring: all.filter(b => b.subscription.effectiveStatus === 'ACTIVE' && b.subscription.contractEndDate && new Date(b.subscription.contractEndDate).getTime() <= now.getTime() + 30 * 86400_000).length,
      monthlyPublished: all.reduce((sum, b) => sum + b.monthlyPublished, 0),
      accounts: all.reduce((sum, b) => sum + b.accountSummary.totalAccounts, 0),
      linkedAccounts: all.reduce((sum, b) => sum + b.accountSummary.linkedAccounts, 0),
      attentionBrands: all.filter(b => b.accountSummary.healthStatus === 'ATTENTION').length,
      followers: all.reduce((sum, b) => sum + b.accountSummary.followers, 0),
      followerDelta: all.reduce((sum, b) => sum + b.accountSummary.followerDelta, 0) },
  }
}

export async function changePrincipal(actor: AuthPrincipal, brandId: string, input: unknown, db = prisma, fromCrew = false) {
  if (actor.source !== 'session' || !actor.globalRoles.includes('ADMIN')) throw new OperationsError('Forbidden', 403)
  return db.$transaction((tx: typeof prisma) => changePrincipalInTransaction(actor, brandId, input, tx, fromCrew), { isolationLevel: 'Serializable' })
}

export async function changePrincipalInTransaction(actor: Pick<AuthPrincipal, 'source' | 'globalRoles' | 'userId' | 'actorType' | 'email'>, brandId: string, input: unknown, tx: typeof prisma, fromCrew = false) {
  if (actor.source !== 'session' || !actor.globalRoles.includes('ADMIN')) throw new OperationsError('Forbidden', 403)
  const body = input as { principalId?: unknown; expectedVersion?: unknown } | null
  if (!body || typeof body.principalId !== 'string' || !body.principalId || typeof body.expectedVersion !== 'string' || !body.expectedVersion) throw new OperationsError('请选择主理人并刷新品牌数据', 400)
  const principalId = body.principalId
  const brand = await tx.brand.findFirst({ where: { id: brandId, status: { not: 'ARCHIVED' }, ...(fromCrew ? {} : { subscriptions: { some: {} } }) }, select: { id: true, crew: { select: { id: true, members: { select: memberSelect } } } } })
  if (!brand) throw new OperationsError('品牌不存在或没有订阅', 404)
  const members: Member[] = brand.crew?.members || []
  if (assignmentVersion(members) !== body.expectedVersion) throw new OperationsError('品牌成员已变更，请刷新后重试', 409)
  if (fromCrew && !members.some(m => m.userId === principalId && m.active)) throw new OperationsError('请先将该成员加入品牌团队并保存', 400)
  const candidate = await tx.user.findFirst({ where: { id: principalId, status: 'ACTIVE', type: 'HUMAN', ...(fromCrew ? {} : { businessRoles: { some: { role: 'AMC_PRINCIPAL' } } }) }, select: { id: true } })
  if (!candidate) throw new OperationsError('该用户不是可指派的启用人类主理人', 400)
  if (members.some(m => m.userId === principalId && m.role === 'OWNER')) throw new OperationsError('不能将品牌主改为主理人', 400)
  const crew = brand.crew || await tx.marketingCrew.create({ data: { brandId }, select: { id: true } })
  const previous = members.filter(m => m.active && m.role === 'PRINCIPAL')
  if (previous.length === 1 && previous[0].userId === principalId) return { ok: true }
  await tx.crewMember.updateMany({ where: { crewId: crew.id, active: true, role: 'PRINCIPAL', userId: { not: principalId } }, data: { role: 'EDITOR' } })
  await tx.crewMember.upsert({ where: { crewId_userId: { crewId: crew.id, userId: principalId } },
    create: { crewId: crew.id, userId: principalId, role: 'PRINCIPAL', active: true, source: 'DIRECT' },
    update: { role: 'PRINCIPAL', active: true, source: 'DIRECT' },
  })
  await tx.auditLog.create({ data: { actorId: actor.userId, actorType: actor.actorType, actorName: actor.email || null,
    action: 'BRAND_PRINCIPAL_CHANGED', resourceType: 'Brand', resourceId: brandId,
    oldValue: { members: members.map(m => ({ userId: m.userId, role: m.role, active: m.active })) },
    newValue: { principalIds: [principalId], previousPrincipalIds: previous.filter(m => m.userId !== principalId).map(m => m.userId) },
  } })
  return { ok: true }
}

export async function getPrincipalTeam(brandId: string, db = prisma) {
  const brand = await db.brand.findFirst({ where: { id: brandId, status: { not: 'ARCHIVED' } }, select: {
    crew: { select: { members: { select: { ...memberSelect, user: { select: { ...personSelect, type: true, status: true } } } } } },
  } })
  if (!brand) throw new OperationsError('品牌不存在', 404)
  const members = (brand.crew?.members || []) as (Member & { user: Person & { type: string; status: string } })[]
  return {
    version: assignmentVersion(members),
    current: members.filter(m => m.active && m.role === 'PRINCIPAL').map(m => m.user),
    candidates: members.filter(m => m.active && m.role !== 'OWNER' && m.user.type === 'HUMAN' && m.user.status === 'ACTIVE').map(m => m.user),
  }
}
