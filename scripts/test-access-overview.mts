import assert from 'node:assert/strict'
import { getMenuGroups, type AppRole } from '../src/lib/permissions.ts'
import { describeKanban } from '../src/lib/access-overview/catalog.ts'
import { ROLES } from '../src/lib/access-overview/types.ts'
import { selectContentRole } from '../src/lib/access-overview/entry-rules.ts'
import { buildOverview, fetchContentOverview, parseContentSnapshot } from '../src/lib/access-overview/overview.ts'
import { loadUserOverview, type UserReader } from '../src/lib/access-overview/users.ts'
import { handleOverview } from '../src/lib/access-overview/handler.ts'
import { principalFromUser } from '../src/lib/auth-v2/types.ts'

for (let mask = 0; mask < 32; mask++) {
  const roles = ROLES.filter((_, index) => mask & (1 << index))
  const visible = new Set(getMenuGroups(roles).flatMap(group => group.items.map(item => item.id)))
  const rows = describeKanban({ roles })
  for (const group of getMenuGroups(['ADMIN', 'RESEARCHER'])) for (const item of group.items) {
    const row = rows.find(row => row.id === `kanban:${item.id}`)!
    assert.equal(['allowed', 'comingSoon'].includes(row.menu.state), visible.has(item.id), `${roles}: ${item.id}`)
  }
  assert.equal(selectContentRole(roles), roles.includes('ADMIN') ? 'ADMIN' : roles.includes('AMC_PRINCIPAL') ? 'AMC_PRINCIPAL' : null)
  assert.equal(selectContentRole(roles, true), roles.includes('ADMIN') ? 'ADMIN' : roles.includes('AMC_PRINCIPAL') ? 'AMC_PRINCIPAL' : roles.includes('RESEARCHER') ? 'RESEARCHER' : null)
}
const row = (roles: AppRole[], id: string, brandScope?: 'allowed' | 'denied' | 'unselected') => describeKanban({ roles, brandScope }).find(entry => entry.id === `kanban:${id}`)!
assert.equal(row(['RESEARCHER'], 'amc-content-roles').status, 'conflict')
assert.equal(row(['RESEARCHER', 'BRAND_OWNER'], 'viral-copy-scripts').menu.state, 'denied')
assert.equal(row(['AMC_PRINCIPAL'], 'video-production').page.state, 'conditional')
assert.equal(row(['AMC_PRINCIPAL'], 'video-production', 'allowed').page.state, 'allowed')
assert.equal(row(['AMC_PRINCIPAL'], 'video-production', 'denied').page.state, 'denied')
assert.equal(row(['ADMIN'], 'video-production').page.state, 'allowed')
assert.equal(row(['ADMIN'], 'video-production', 'denied').page.state, 'denied')
assert.equal(row(['BD'], 'bd-workspace').status, 'comingSoon')
assert.ok(describeKanban({ roles: ['ADMIN'], active: false }).every(entry => entry.status === 'denied' && entry.operations.every(op => op.state === 'denied')))
assert.ok(buildOverview({ reason: 'offline' }).matrix!.ADMIN.filter(entry => entry.system === 'content').every(entry => entry.status === 'unknown'))
assert.equal(parseContentSnapshot({ contractVersion: 2, ruleVersion: '2026-09-17.1', roles: {} }), null)
assert.equal(parseContentSnapshot({ contractVersion: 1, ruleVersion: 'old', roles: {} }), null)
assert.match((await fetchContentOverview({})).reason!, /未配置/)
assert.match((await fetchContentOverview({ baseUrl: 'http://content', token: 'test', fetcher: async () => { throw Error('secret must not leak') } })).reason!, /连接失败/)
assert.match((await fetchContentOverview({ baseUrl: 'http://content', token: 'test', fetcher: async () => Response.json({}, { status: 401 }) })).reason!, /401/)
assert.match((await fetchContentOverview({ baseUrl: 'http://content', token: 'test', fetcher: async () => Response.json({ contractVersion: 7 }) })).reason!, /不匹配/)

const user = { id: 'operator', email: 'operator@example.test', nickname: '测试主理人', type: 'HUMAN', role: 'USER', status: 'ACTIVE', authVersion: 1, businessRoles: [{ role: 'AMC_PRINCIPAL' }] }
const member = (id: string) => ({ role: 'PRINCIPAL', source: 'DIRECT', crew: { brand: { id, name: id } } })
let memberships = [member('direct')]
let inherited = [member('organization')]
let allowed = true
let checked = 0
const queries: unknown[] = []
const db: UserReader = {
  user: {
    findUnique: async args => { queries.push(args); return user },
    findMany: async args => { queries.push(args); return [{ id: user.id, crewMemberships: memberships, organizationsJoined: [{ ownerId: 'org-owner', owner: { crewMemberships: inherited } }] }] },
  },
  brand: { findMany: async () => [], findUnique: async () => ({ id: 'direct' }) },
}
const authorize = async () => { checked++; return allowed }
let detail = await loadUserOverview(db, user.id, 'direct', authorize)
assert.deepEqual(detail!.brands.map(brand => brand.id), ['direct', 'organization'])
assert.match(detail!.brands[1].sources[0], /组织继承/)
assert.equal(detail!.context.brandScope, 'allowed')
assert.equal(checked, 1, 'use real brand authorization adapter for selected brand')
memberships = []; inherited = []; allowed = false
detail = await loadUserOverview(db, user.id, 'direct', authorize)
assert.equal(detail!.brands.length, 0, 'refresh must not cache revoked memberships')
assert.equal(detail!.context.brandScope, 'denied')
user.status = 'DISABLED'
detail = await loadUserOverview(db, user.id, 'direct', authorize)
assert.equal(detail!.context.active, false)
assert.equal(detail!.brands.length, 0)
assert.equal(checked, 2, 'inactive user must not reach business authorization')
assert.doesNotMatch(JSON.stringify(queries), /password|apiKeys|token/)
user.status = 'ACTIVE'
user.businessRoles = []
const noRole = await loadUserOverview(db, user.id, undefined, authorize)
assert.deepEqual(noRole!.context.roles, [])
assert.deepEqual(noRole!.context.menuRoles, ['AMC_PRINCIPAL'], 'preserve the actual legacy sidebar fallback, do not invent backend grants')
assert.equal(buildOverview({}, noRole!.context).entries!.find(row => row.id === 'kanban:amc-content-roles')!.status, 'conflict')
user.status = 'DISABLED'

const admin = principalFromUser({ ...user, status: 'ACTIVE', role: 'ADMIN' }, 'session')
const forbiddenLoad = async () => { throw Error('unauthorized access reached data layer') }
let response = await handleOverview({ authenticate: async () => null, content: forbiddenLoad, user: forbiddenLoad })
assert.equal(response.status, 401)
assert.equal(response.headers.get('cache-control'), 'no-store')
response = await handleOverview({ authenticate: async () => ({ ...admin, source: 'api_key' }), content: forbiddenLoad, user: forbiddenLoad })
assert.equal(response.status, 403)
response = await handleOverview({ authenticate: async () => ({ ...admin, globalRoles: ['AMC_PRINCIPAL'] }), content: forbiddenLoad, user: forbiddenLoad })
assert.equal(response.status, 403)
response = await handleOverview({ authenticate: async () => admin, content: async () => ({ reason: 'offline' }), user: async () => detail }, user.id, 'direct')
assert.equal(response.status, 200)
const payload = await response.json()
assert.equal(payload.user.status, 'DISABLED')
assert.ok(payload.entries.every((entry: { status: string }) => entry.status === 'denied'))
assert.doesNotMatch(JSON.stringify(payload), /password|secret|token|credential/)
response = await handleOverview({ authenticate: async () => admin, content: forbiddenLoad, user: async () => null }, 'missing')
assert.equal(response.status, 404)
response = await handleOverview({ authenticate: async () => admin, content: async () => ({ reason: 'offline' }), user: forbiddenLoad })
assert.equal(response.status, 200)
console.log('PASS: 32 role combinations, menu parity, entry guards, scopes, revocation, inactive users, no-store, session-only access and Content failures')
