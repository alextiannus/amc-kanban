import { createHash } from 'node:crypto'
import { prisma } from '../prisma'
import type { AuthPrincipal } from '../auth-v2/types'
import { monthWindow, selectSubscription, subscriptionState, type SubscriptionSummary } from './policy'

export class OperationsError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
type Person = { id: string; nickname: string | null; email: string }
type Member = { id: string; userId: string; role: string; active: boolean; updatedAt: Date; user: Person }
type BrandRow = { id: string; name: string; location: string | null; status: string; subscriptions: SubscriptionSummary[]; crew: { members: Member[] } | null }
const personSelect = { id: true, nickname: true, email: true }
const memberSelect = { id: true, userId: true, role: true, active: true, updatedAt: true, user: { select: personSelect } }
export const assignmentVersion = (members: Member[]) => createHash('sha256').update(JSON.stringify(
  members.map(m => [m.id, m.userId, m.role, m.active, new Date(m.updatedAt).toISOString()]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
)).digest('hex')

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
  const brands: BrandRow[] = await db.brand.findMany({ where: { status: { not: 'ARCHIVED' }, subscriptions: { some: {} }, ...(scope ? { id: { in: scope } } : {}) }, select: {
    id: true, name: true, location: true, status: true,
    subscriptions: { select: { id: true, planName: true, status: true, feeWaived: true, contractStartDate: true, contractEndDate: true, createdAt: true } },
    crew: { select: { members: { select: memberSelect } } },
  } })
  const ids = brands.map(b => b.id)
  const period = monthWindow(now)
  type Count = { brandId: string; _count: { _all: number }; _max?: { publishedAt: Date | null } }
  const [monthly, latest, candidates]: [Count[], Count[], Person[]] = await Promise.all([
    ids.length ? db.contentDraft.groupBy({ by: ['brandId'], where: { brandId: { in: ids }, status: 'published', publishedAt: { gte: period.start, lte: period.end } }, _count: { _all: true } }) : [],
    ids.length ? db.contentDraft.groupBy({ by: ['brandId'], where: { brandId: { in: ids }, status: 'published', publishedAt: { lte: now } }, _max: { publishedAt: true } }) : [],
    admin ? db.user.findMany({ where: { status: 'ACTIVE', businessRoles: { some: { role: 'AMC_PRINCIPAL' } } }, select: personSelect, orderBy: [{ nickname: 'asc' }, { id: 'asc' }] }) : [],
  ])
  const counts = new Map(monthly.map(r => [r.brandId, r._count._all]))
  const dates = new Map(latest.map(r => [r.brandId, r._max?.publishedAt || null]))
  const all = brands.map(b => {
    const sub = selectSubscription(b.subscriptions, now)
    const members = b.crew?.members || []
    return { id: b.id, name: b.name, location: b.location, status: b.status,
      subscription: { ...sub, effectiveStatus: subscriptionState(sub, now) },
      owners: members.filter(m => m.active && m.role === 'OWNER').map(m => m.user),
      principals: members.filter(m => m.active && m.role === 'PRINCIPAL').map(m => m.user),
      assignmentVersion: admin ? assignmentVersion(members) : undefined,
      monthlyPublished: counts.get(b.id) || 0, lastPublishedAt: dates.get(b.id) || null,
    }
  })
  const principalOptions = [...new Map(all.flatMap(b => b.principals).map(p => [p.id, p])).values()]
  const query = (params.get('q') || '').trim().toLocaleLowerCase().slice(0, 200)
  const status = params.get('status') || ''
  const principalId = params.get('principalId') || ''
  const rows = all.filter(b => (!status || b.subscription.effectiveStatus === status) &&
    (!principalId || (principalId === 'unassigned' ? !b.principals.length : b.principals.some(p => p.id === principalId))) &&
    (!query || [b.name, b.location, b.subscription.planName, ...[...b.owners, ...b.principals].flatMap(p => [p.nickname, p.email])].some(v => v?.toLocaleLowerCase().includes(query))))
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
      monthlyPublished: all.reduce((sum, b) => sum + b.monthlyPublished, 0) },
  }
}

export async function changePrincipal(actor: AuthPrincipal, brandId: string, input: unknown, db = prisma) {
  if (actor.source !== 'session' || !actor.globalRoles.includes('ADMIN')) throw new OperationsError('Forbidden', 403)
  const body = input as { principalId?: unknown; expectedVersion?: unknown } | null
  if (!body || typeof body.principalId !== 'string' || !body.principalId || typeof body.expectedVersion !== 'string' || !body.expectedVersion) throw new OperationsError('请选择主理人并刷新品牌数据', 400)
  const principalId = body.principalId
  return db.$transaction(async (tx: typeof prisma) => {
    const brand = await tx.brand.findFirst({ where: { id: brandId, status: { not: 'ARCHIVED' }, subscriptions: { some: {} } }, select: { id: true, crew: { select: { id: true, members: { select: memberSelect } } } } })
    if (!brand) throw new OperationsError('品牌不存在或没有订阅', 404)
    const members: Member[] = brand.crew?.members || []
    if (assignmentVersion(members) !== body.expectedVersion) throw new OperationsError('品牌成员已变更，请刷新后重试', 409)
    const candidate = await tx.user.findFirst({ where: { id: principalId, status: 'ACTIVE', businessRoles: { some: { role: 'AMC_PRINCIPAL' } } }, select: { id: true } })
    if (!candidate) throw new OperationsError('该用户不是启用的品牌主理人', 400)
    if (members.some(m => m.userId === principalId && m.role === 'OWNER')) throw new OperationsError('不能将品牌主改为主理人', 400)
    const crew = brand.crew || await tx.marketingCrew.create({ data: { brandId }, select: { id: true } })
    const previous = members.filter(m => m.active && m.role === 'PRINCIPAL')
    if (previous.length === 1 && previous[0].userId === principalId) return { ok: true }
    await tx.crewMember.updateMany({ where: { crewId: crew.id, active: true, role: 'PRINCIPAL', userId: { not: principalId } }, data: { active: false } })
    await tx.crewMember.upsert({ where: { crewId_userId: { crewId: crew.id, userId: principalId } },
      create: { crewId: crew.id, userId: principalId, role: 'PRINCIPAL', active: true, source: 'DIRECT' },
      update: { role: 'PRINCIPAL', active: true, source: 'DIRECT' },
    })
    await tx.auditLog.create({ data: { actorId: actor.userId, actorType: actor.actorType, actorName: actor.email || null,
      action: 'BRAND_PRINCIPAL_CHANGED', resourceType: 'Brand', resourceId: brandId,
      oldValue: { members: members.map(m => ({ userId: m.userId, role: m.role, active: m.active })) },
      newValue: { principalIds: [principalId], deactivatedPrincipalIds: previous.filter(m => m.userId !== principalId).map(m => m.userId) },
    } })
    return { ok: true }
  }, { isolationLevel: 'Serializable' })
}
