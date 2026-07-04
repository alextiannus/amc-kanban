import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { CAPABILITIES, hasCapability } from '../src/lib/auth-v2/capabilities.ts'
import { hashPassword, isArgon2Hash, verifyPassword } from '../src/lib/auth-v2/password.ts'
import { isLegacyKeyCompatibilityActive } from '../src/lib/auth-v2/compat.ts'
import {
  createSessionToken,
  verifySessionToken,
} from '../src/lib/auth-v2/session.ts'

process.env.JWT_SECRET ||= 'test-auth-v2-secret-at-least-32-characters'

async function testCapabilities() {
  assert.equal(hasCapability(['ADMIN'], 'system.configure'), true)
  assert.equal(hasCapability(['AMC_PRINCIPAL'], 'agent.manage'), true)
  assert.equal(hasCapability(['BRAND_OWNER'], 'draft.approve'), true)
  assert.equal(hasCapability(['BRAND_OWNER'], 'user.manage'), false)
  assert.equal(hasCapability(['BD'], 'brand.create'), true)
  assert.equal(hasCapability(['BD'], 'draft.read'), false)
  assert.ok(CAPABILITIES.length >= 20)
}

async function testPasswords() {
  const password = 'Correct-Horse-Battery-Staple-2026'
  const argonHash = await hashPassword(password)
  assert.equal(isArgon2Hash(argonHash), true)
  assert.deepEqual(await verifyPassword(password, argonHash), {
    valid: true,
    needsRehash: false,
  })
  assert.equal((await verifyPassword('wrong', argonHash)).valid, false)

  const legacyHash = await bcrypt.hash(password, 4)
  assert.deepEqual(await verifyPassword(password, legacyHash), {
    valid: true,
    needsRehash: true,
  })
}

async function testSessions() {
  const token = await createSessionToken({
    userId: 'user-auth-v2',
    type: 'HUMAN',
    authVersion: 3,
    expiresIn: '5m',
  })
  const claims = await verifySessionToken(token)
  assert.equal(claims?.sub, 'user-auth-v2')
  assert.equal(claims?.authVersion, 3)

  const key = new TextEncoder().encode(process.env.JWT_SECRET)
  const legacy = await new SignJWT({
    user: { id: 'legacy-user', type: 'HUMAN', role: 'USER' },
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key)
  process.env.AUTH_V2_LEGACY_SESSION_CUTOFF_AT = new Date(Date.now() + 60_000).toISOString()
  const legacyClaims = await verifySessionToken(legacy)
  assert.equal(legacyClaims?.sub, 'legacy-user')
  assert.equal(legacyClaims?.authVersion, 0)

  process.env.AUTH_V2_LEGACY_SESSION_CUTOFF_AT = new Date(Date.now() - 1).toISOString()
  assert.equal(await verifySessionToken(legacy), null)
}

function testCompatibilityCutoff() {
  process.env.AUTH_V2_LEGACY_KEYS = 'true'
  process.env.AUTH_V2_LEGACY_KEY_CUTOFF_AT = '2026-07-05T00:00:00.000Z'
  assert.equal(
    isLegacyKeyCompatibilityActive(Date.parse('2026-07-04T23:59:59.000Z')),
    true,
  )
  assert.equal(
    isLegacyKeyCompatibilityActive(Date.parse('2026-07-05T00:00:00.000Z')),
    false,
  )
  process.env.AUTH_V2_LEGACY_KEYS = 'false'
  assert.equal(
    isLegacyKeyCompatibilityActive(Date.parse('2026-07-04T00:00:00.000Z')),
    false,
  )
}

await testCapabilities()
await testPasswords()
await testSessions()
testCompatibilityCutoff()
console.log('Auth V2 unit tests passed.')
