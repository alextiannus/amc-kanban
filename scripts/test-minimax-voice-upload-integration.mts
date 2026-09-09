import * as miniMaxEndpoints from '../src/lib/miniMaxEndpoints.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import * as responseHelpers from '../src/lib/miniMaxVoiceResponse.ts'

const require = createRequire(import.meta.url)
const config = { id: 'test', apiKey: 'test-secret', baseUrl: 'https://api.minimaxi.com/v1/t2a_v2' }
const calls: any[] = []
let rejected = true
const modules: Record<string, any> = {
  '@/lib/miniMaxEndpoints': miniMaxEndpoints,
  '@/lib/miniMaxVoiceResponse': responseHelpers,
  '@/lib/prisma': { prisma: {} },
  '@/lib/ttsGeneration': { getActiveMiniMaxTtsConfigs: async () => [config] },
}
const source = readFileSync(new URL('../src/lib/brandVoiceProfiles.ts', import.meta.url), 'utf8') +
  '\nexport { uploadMiniMaxVoiceSource, cloneMiniMaxVoice };'
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} as any }
runInNewContext(compiled, { module, exports: module.exports, require: (id: string) => modules[id] || require(id),
  crypto: globalThis.crypto, FormData, File, URL, AbortSignal, console,
  fetch: async (url: string, options: any) => {
    calls.push({ url, options })
    if (url.endsWith('/files/upload')) {
      assert.ok(options.body instanceof FormData)
      assert.equal(options.body.get('purpose'), 'voice_clone')
      assert.ok(options.body.get('file') instanceof File)
      assert.equal(options.headers['Content-Type'], undefined)
      return new Response(rejected
        ? '{"base_resp":{"status_code":1004,"status_msg":"authentication failed"}}'
        : '{"file":{"file_id":123456789012345681},"base_resp":{"status_code":0}}')
    }
    assert.ok(options.body.includes('"file_id":123456789012345681,'))
    return new Response('{"base_resp":{"status_code":0}}')
  },
})
const service = module.exports
const file = new File(['sample'], 'sample.wav', { type: 'audio/wav' })
await assert.rejects(service.createBrandVoiceProfile({ brandId: 'test-brand', actorId: 'actor', file }), /upload.*1004.*authentication failed/)
assert.equal(calls.length, 1, 'Rejected uploads must not reach clone or persistence')
rejected = false
const fileId = await service.uploadMiniMaxVoiceSource(config, file)
assert.equal(fileId, '123456789012345681')
await service.cloneMiniMaxVoice(config, { fileId, voiceId: 'test-voice', modelName: 'speech-2.8-hd', sampleText: 'test' })
console.log('PASS: legacy enrollment propagates upload errors and preserves file ID through clone request')

// An empty endpoint must use the same region as TTS, never the international fallback.
for (const [baseUrl, origin] of [
  [null, 'https://api.minimaxi.com'],
  ['', 'https://api.minimaxi.com'],
  ['https://api.minimaxi.com/v1/t2a_v2', 'https://api.minimaxi.com'],
] as const) {
  const selected = { ...config, baseUrl }
  const id = await service.uploadMiniMaxVoiceSource(selected, file)
  assert.equal(calls.at(-1).url, `${origin}/v1/files/upload`)
  await service.cloneMiniMaxVoice(selected, { fileId: id, voiceId: 'test-voice', modelName: 'speech-2.8-hd', sampleText: 'test' })
  assert.equal(calls.at(-1).url, `${origin}/v1/voice_clone`)
}
const beforeInvalid = calls.length
await assert.rejects(service.uploadMiniMaxVoiceSource({ ...config, baseUrl: 'invalid-address' }, file), /Invalid URL/)
assert.equal(calls.length, beforeInvalid, 'Invalid configuration must not send the key to a fallback host')
console.log('PASS: upload and cloning preserve configured region and share the domestic TTS default')

await assert.rejects(service.uploadMiniMaxVoiceSource({ ...config, baseUrl: 'https://api.minimax.io/v1/t2a_v2' }, file), /DOMESTIC_ENDPOINT_REQUIRED/)
assert.equal(calls.length, beforeInvalid, 'International configuration must fail before network access')
assert.ok(calls.every(c => c.options.redirect === 'error'), 'No redirect may silently change the endpoint')

let saved: any = null
let failActivation = false
const ttsCalls: any[] = []
modules['@/lib/prisma'].prisma.brandKnowledge = {
  findUnique: async () => saved,
  upsert: async ({ create, update }: any) => { saved = saved ? { ...saved, ...update } : create; return saved },
}
modules['@/lib/ttsGeneration'].generateTtsAudio = async (input: any) => {
  ttsCalls.push(input)
  if (failActivation) throw new Error('activation rejected')
  return { audio: Buffer.from('test') }
}
failActivation = true
await assert.rejects(service.createBrandVoiceProfile({ brandId: 'test-brand', actorId: 'actor', file }), /activation rejected/)
assert.equal(saved, null, 'Activation failure must not create a ready profile')
failActivation = false
const created = await service.createBrandVoiceProfile({ brandId: 'test-brand', actorId: 'actor', file })
assert.equal(created.profile.configId, config.id)
await service.previewBrandVoiceProfile('test-brand', created.profile.id, { actorId: 'actor' })
assert.ok(ttsCalls.every(call => call.configId === config.id))
delete saved.brandVoiceProfiles[0].configId
const previews = ttsCalls.length
await assert.rejects(service.previewBrandVoiceProfile('test-brand', created.profile.id, { actorId: 'actor' }), /REENROLL_REQUIRED/)
assert.equal(ttsCalls.length, previews, 'Unbound legacy voices must not guess a configuration')
console.log('PASS: activation and preview pin the clone configuration; activation failures remain errors')
