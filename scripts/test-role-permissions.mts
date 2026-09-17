import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { POLICY_ROLES, defaultGrants, effectiveGrants, validateGrants, permissionSources, PERMISSION_MODULES } from '../src/lib/role-permissions/contract.ts'
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test'
const { savePolicy } = await import('../src/lib/role-permissions/store.ts')
import { getMenuGroups, resolveRoles } from '../src/lib/permissions.ts'
import { describePolicy } from '../src/lib/role-permissions/describe.ts'
import { kanbanRoutePermission } from '../src/lib/role-permissions/routes.ts'
import { signAccessIdentity, verifyAccessIdentity } from '../src/lib/role-permissions/token.ts'
import type { AuthPrincipal } from '../src/lib/auth-v2/types.ts'

const policies = Object.fromEntries(POLICY_ROLES.map(r => [r, defaultGrants(r)]))
for (let mask = 0; mask < 32; mask++) {
  const roles = ['ADMIN', ...POLICY_ROLES].filter((_, i) => mask & (1 << i))
  const grants = effectiveGrants(roles, policies)
  const expected = new Set(roles.flatMap(defaultGrants))
  assert.deepEqual(new Set(grants), expected)
  assert.ok(getMenuGroups(roles as any, grants).every(group => group.items.length > 0))
}
assert.deepEqual(resolveRoles({ userRoles: [], dashboardRole: 'BRAND_DIRECTOR' }), [])
assert.deepEqual(validateGrants([]), [])
assert.throws(() => validateGrants(['user.manage']))
assert.throws(() => validateGrants(['content.video-making.generate']))
policies.AMC_PRINCIPAL = []
policies.RESEARCHER = ['content.video-making.read', 'content.video-making.generate']
assert.deepEqual(permissionSources(['AMC_PRINCIPAL', 'RESEARCHER'], policies)['content.video-making.generate'], ['RESEARCHER'])
assert.equal(describePolicy([], { roles: ['RESEARCHER'], active: false }, policies, true).every(row => row.status === 'denied'), true)
assert.equal(describePolicy([], { roles: ['RESEARCHER'], brandScope: 'denied' }, policies, true).find(row => row.label === '视频制作')!.page.state, 'denied')
assert.equal(describePolicy([], { roles: ['RESEARCHER'] }, policies, false).find(row => row.label === '视频制作')!.page.state, 'unknown')
assert.equal(kanbanRoutePermission('/api/brands/a/drafts/b/approve', 'POST'), 'draft.approve')
assert.equal(kanbanRoutePermission('/api/brands/a/posts/publish', 'POST'), 'content.publish')
assert.equal(kanbanRoutePermission('/api/content/video/create', 'POST'), 'content.video-making.generate')
assert.equal(kanbanRoutePermission('/api/game/config', 'POST'), 'game.update')
assert.equal(kanbanRoutePermission('/api/brands/a/subscription', 'GET'), 'subscription.read')
assert.equal(kanbanRoutePermission('/api/subscription/confirm', 'POST'), 'subscription.manage')
assert.equal(kanbanRoutePermission('/api/agents/a', 'PATCH'), 'agent.manage')
assert.equal(kanbanRoutePermission('/api/agents/register', 'POST'), null, 'system registration retains its own authentication')
assert.equal(kanbanRoutePermission('/api/brands/a/drafts/b/retry-publish', 'POST'), 'content.retry')
const admin: AuthPrincipal = { userId: 'admin', globalRoles: ['ADMIN'], actorType: 'HUMAN', source: 'session', authVersion: 1 }
process.env.AMC_CONTENT_LAB_TOKEN_SECRET = 'permission-test-secret'
const token = signAccessIdentity(admin, 'brand-a')
assert.equal(verifyAccessIdentity(token)?.brandId, 'brand-a')
assert.equal(verifyAccessIdentity(token + 'x'), null)

// Exercise the production transaction against real PostgreSQL semantics in PGlite.
const pg = new PGlite()
await pg.exec(await readFile(new URL('../prisma/migrations/20260917090000_role_permission_policy/migration.sql', import.meta.url), 'utf8'))
await pg.exec('CREATE TABLE test_audit (value jsonb NOT NULL)')
let failAudit = false
const db: any = {
  $transaction: (fn: any) => pg.transaction(async sql => fn({
    roleDefinition: { findUnique: async ({where}: any) => POLICY_ROLES.includes(where.id) ? {id:where.id} : null },
    rolePermissionPolicy: {
      findUnique: async ({ where }: any) => (await sql.query('SELECT * FROM "RolePermissionPolicy" WHERE role=$1', [where.role])).rows[0] || null,
      create: async ({ data }: any) => sql.query('INSERT INTO "RolePermissionPolicy" (role,grants,version) VALUES ($1,$2::jsonb,$3)', [data.role, JSON.stringify(data.grants), data.version]),
      updateMany: async ({ where, data }: any) => ({ count: (await sql.query('UPDATE "RolePermissionPolicy" SET grants=$3::jsonb,version=version+1 WHERE role=$1 AND version=$2 RETURNING role', [where.role, where.version, JSON.stringify(data.grants)])).rows.length }),
    },
    auditLog: { create: async ({data}: any) => { if (failAudit) throw Error('audit failure'); await sql.query('INSERT INTO test_audit VALUES ($1::jsonb)', [JSON.stringify(data)]) } },
    user: { count: async () => 2 },
  })),
}
const initial = (await pg.query<{version:number}>('SELECT version FROM "RolePermissionPolicy" WHERE role=$1', ['AMC_PRINCIPAL'])).rows[0]?.version || 0
await assert.rejects(savePolicy({...admin, source:'api_key'}, 'AMC_PRINCIPAL', {grants:[], expectedVersion:initial}, db), /Forbidden/)
await assert.rejects(savePolicy(admin, 'ADMIN', {grants:[], expectedVersion:0}, db), /不能修改/)
const saved = await savePolicy(admin, 'AMC_PRINCIPAL', {grants:[], expectedVersion:initial}, db)
assert.equal(saved.version, initial+1)
await assert.rejects(savePolicy(admin, 'AMC_PRINCIPAL', {grants:[], expectedVersion:initial}, db), /刷新/)
failAudit = true
await assert.rejects(savePolicy(admin, 'AMC_PRINCIPAL', {grants:['brand.read'], expectedVersion:saved.version}, db), /audit failure/)
assert.deepEqual((await pg.query<{grants:string[]}>('SELECT grants FROM "RolePermissionPolicy" WHERE role=$1',['AMC_PRINCIPAL'])).rows[0].grants, [])
assert.equal((await pg.query('SELECT * FROM test_audit')).rows.length, 1)
await pg.close()
console.log(`PASS: ${PERMISSION_MODULES.length} modules, 32 role combinations, defaults, dependencies, live revocation, identity signatures, scopes, optimistic locking and audit rollback`)
