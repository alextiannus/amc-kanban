import assert from 'node:assert/strict'

let disabled = false, missingConfig = false, consent = true, domestic = true, rejectTts = false
const profile = { id: 'voice-a', brandId: 'brand-a', providerVoiceId: 'clone-a', configId: 'config-a', label: 'Owner', role: 'owner', status: 'ready',
  consent: { confirmedByUserId: 'operator', confirmedAt: '2026-09-09', scope: 'brand_content' } }
const mockPrisma: any = {
  $extends() { return this },
  user: { findFirst: async ({ where }: any) => where.id.in[0] === 'operator' && JSON.stringify(where).includes('brand-a') ? { id: 'operator' } : null },
  brandKnowledge: { findUnique: async ({ where }: any) => ({ brandVoiceProfiles: where.brandId === 'brand-a'
    ? [{ ...profile, status: disabled ? 'disabled' : 'ready', consent: consent ? profile.consent : {} }] : [], defaultBrandVoiceProfileId: 'voice-a' }) },
  lLMConfig: { findMany: async () => missingConfig ? [] : [{ id: 'config-a', provider: 'minimax', modelName: 'speech-2.8-hd', apiKey: 'test-key-a',
    baseUrl: domestic ? 'https://api.minimaxi.com/v1/t2a_v2' : 'https://api.minimax.io/v1/t2a_v2', timeoutMs: 120000, taskTags: ['tts'] },
    { id: 'config-b', provider: 'minimax', modelName: 'speech-2.8-hd', apiKey: 'never-use-key-b', taskTags: ['tts'] }] },
}
;(globalThis as any).prisma = mockPrisma
process.env.CONTENT_SERVICE_INTERNAL_TOKEN = 'fixture-service-token'
const { POST } = await import('../src/app/api/internal/content-brand-voices/route.ts')
let calls = 0
globalThis.fetch = (async (url: any, init: any) => {
  calls++
  assert.equal(url, 'https://api.minimaxi.com/v1/t2a_v2')
  assert.equal(init.headers.Authorization, 'Bearer test-key-a')
  assert.equal(init.redirect, 'error')
  const body = JSON.parse(init.body)
  assert.equal(body.voice_setting.voice_id, 'clone-a')
  assert.equal(body.voice_setting.speed, 1.2)
  return Response.json(rejectTts ? { base_resp: { status_code: 2049, status_msg: 'invalid api key' } }
    : { base_resp: { status_code: 0 }, data: { audio: '01020304' }, extra_info: { audio_length: 2400 } })
}) as typeof fetch
const request = (body: any, token = 'fixture-service-token') => POST(new Request('http://localhost/api/internal/content-brand-voices', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-content-service-token': token },
  body: JSON.stringify({ brandId: 'brand-a', actorId: 'operator', actorRole: 'AMC_PRINCIPAL', ...body }),
}))
assert.equal((await request({ action: 'list' }, 'wrong')).status, 401)
assert.equal((await request({ action: 'list', actorId: 'outsider' })).status, 404)
assert.equal((await request({ action: 'list', brandId: 'brand-b' })).status, 404)
const listed = await (await request({ action: 'list' })).json()
assert.equal(listed.items[0].usable, true)
assert.equal(listed.items[0].isDefault, true)
assert(!JSON.stringify(listed).includes('config-a'))
assert(!JSON.stringify(listed).includes('clone-a'))
const resolved = await (await request({ action: 'resolve', brandVoiceProfileId: 'voice-a' })).json()
assert.equal(resolved.selection.configId, 'config-a')
assert.equal((await request({ action: 'resolve', brandVoiceProfileId: 'other' })).status, 404)
assert.equal((await request({ action: 'resolve', brandVoiceProfileId: 'voice-a', expected: { ...resolved.selection, configId: 'injected' } })).status, 409)
const generate = { action: 'generate', brandVoiceProfileId: 'voice-a', text: 'Hello merchant', speed: 1.2, expected: resolved.selection }
const generated = await (await request(generate)).json()
assert.equal(generated.durationSec, 2.4)
assert.equal(generated.audioBase64, 'AQIDBA==')
assert.deepEqual(generated.provenance.fallbackPath, [])
rejectTts = true
assert.equal((await request(generate)).status, 502)
assert.equal(calls, 2, 'A failure never calls another config')
rejectTts = false
disabled = true
assert.equal((await request(generate)).status, 409)
disabled = false; consent = false
assert.equal((await request(generate)).status, 409)
consent = true; missingConfig = true
assert.equal((await request(generate)).status, 409)
missingConfig = false; domestic = false
assert.equal((await request(generate)).status, 502)
assert.equal(calls, 2, 'Unavailable voices never call MiniMax')
console.log('PASS: internal authentication, brand isolation, safe catalog, bound domestic synthesis, consent, disabled/config failures, no fallback')
