import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { signAccessIdentity, verifyAccessIdentity } from '../src/lib/role-permissions/token.ts'
import { kanbanRoutePermission } from '../src/lib/role-permissions/routes.ts'

process.env.AMC_CONTENT_LAB_TOKEN_SECRET = 'test-content-identity-only'
let principal: any = { userId: 'merchant', email: 'merchant@test.invalid', globalRoles: ['BRAND_OWNER'], authVersion: 3 }
let scope = true, allowed = true, unavailable = false, configured = true
const source = await readFile(new URL('../src/app/api/content/access-identity/route.ts', import.meta.url), 'utf8')
const parsed = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true)
const code = ts.createPrinter().printFile(ts.factory.updateSourceFile(parsed, parsed.statements.filter(s => !ts.isImportDeclaration(s))))
const context = vm.createContext({ exports: {}, Response,
  authenticateCurrentSession: async () => principal,
  canAccessBrandScope: async (_principal: any, brandId: string) => scope && brandId === 'brand-a',
  allows: async (_principal: any, permission: string) => { assert.equal(permission, 'content.video-making.read'); if (unavailable) throw Error('database offline'); return allowed },
  labSecret: () => configured, signAccessIdentity,
})
vm.runInContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
const post = (body: unknown = { brandId: 'brand-a' }) => context.exports.POST(new Request('https://kanban.test/api/content/access-identity', { method: 'POST', body: JSON.stringify(body) }))
for (const role of ['BRAND_OWNER', 'ADMIN', 'custom_editor']) {
  principal.globalRoles = [role]
  const result = await post()
  assert.equal(result.status, 200)
  assert.equal(result.headers.get('cache-control'), 'no-store')
  const data = await result.json()
  const token = verifyAccessIdentity(data.identity)!
  assert.equal(token.sub, 'merchant'); assert.equal(token.brandId, 'brand-a'); assert.equal(token.authVersion, 3)
  assert.equal(verifyAccessIdentity(data.identity + 'tampered'), null)
}
assert.equal((await post({ brandId: 'brand-b', userId: 'admin', role: 'ADMIN' })).status, 403)
for (const body of [null, {}, { brandId: [] }, { brandId: '' }]) assert.equal((await post(body)).status, 400)
allowed = false; assert.equal((await post()).status, 403)
allowed = true; scope = false; assert.equal((await post()).status, 403)
scope = true; unavailable = true; assert.equal((await post()).status, 503)
unavailable = false; configured = false; assert.equal((await post()).status, 503)
configured = true; principal = null; assert.equal((await post()).status, 401)
assert.equal(kanbanRoutePermission('/api/content/access-identity', 'POST'), 'content.video-making.read')
console.log('PASS: Content identity uses current session, signed brand/auth version, unified role policy, no-store and fails closed')
