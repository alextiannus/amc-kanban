import assert from 'node:assert/strict'
import { planUserRoleAssignments as plan } from '../src/lib/role-permissions/user-assignments.ts'

const catalog = [
  { id: 'ADMIN', enabled: true, builtIn: true },
  { id: 'BRAND_OWNER', enabled: true, builtIn: true },
  { id: 'custom_editor', enabled: true, builtIn: false },
  { id: 'custom_off', enabled: false, builtIn: false },
]
assert.deepEqual(plan(['BRAND_OWNER', 'custom_editor'], ['ADMIN', 'BRAND_OWNER'], catalog).add, ['custom_editor'])
assert.equal(plan(['custom_editor'], [], catalog).needsContent, true)
assert.deepEqual(plan(['custom_off'], ['custom_off'], catalog).add, [])
assert.deepEqual(plan([], ['custom_off'], catalog).remove, ['custom_off'])
assert.deepEqual(plan(['BRAND_OWNER'], ['ADMIN', 'BRAND_OWNER'], catalog).remove, [])
assert.throws(() => plan(['custom_off'], [], catalog))
assert.throws(() => plan(['missing'], [], catalog))
assert.throws(() => plan(['ADMIN'], [], catalog))
assert.throws(() => plan([42], [], catalog))
console.log('User role assignment validation passed')
