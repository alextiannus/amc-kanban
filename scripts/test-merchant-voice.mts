import * as miniMaxEndpoints from '../src/lib/miniMaxEndpoints.ts'
import * as miniMaxVoiceResponse from '../src/lib/miniMaxVoiceResponse.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { inspectVoiceAudio, validateVoiceMetadata } from '../src/lib/voiceAudioValidation.ts'

// Real container inspection, without provider calls or a database.
function wav(seconds: number) {
  const samples = Math.round(seconds * 16000)
  const b = Buffer.alloc(44 + samples * 2)
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(samples * 2, 40)
  return b
}
assert.equal((await inspectVoiceAudio(wav(10))).duration, 10)
await assert.rejects(inspectVoiceAudio(wav(9)), /DURATION/)
await assert.rejects(inspectVoiceAudio(wav(301)), /DURATION/)
await assert.rejects(inspectVoiceAudio(Buffer.from('fake.wav')), /FORMAT/)
await assert.rejects(inspectVoiceAudio(Buffer.alloc(20_000_001)), /SIZE/)
assert.throws(() => validateVoiceMetadata({ format: 'MPEG-4', duration: 30, audioCount: 1, videoCount: 1 }), /FORMAT/)

const clone = (v: any) => v === undefined ? undefined : structuredClone(v)
const records = new Map<string, any>()
const tasks = new Map<string, any>()
let lock = Promise.resolve()
const matches = (row: any, where: any): boolean => Object.entries(where || {}).every(([key, value]: [string, any]) => {
  if (key === 'OR') return value.some((w: any) => matches(row, w))
  if (key === 'brandId_kind_requestKey') return matches(row, value)
  if (value instanceof Date) return row[key]?.getTime() === value.getTime()
  if (value && typeof value === 'object' && 'lt' in value) return row[key] && row[key] < value.lt
  return row[key] === value
})
const db: any = {
  $executeRaw: async () => 1,
  $transaction: (fn: any) => {
    const result = lock.then(() => fn(db)); lock = result.catch(() => {}); return result
  },
  brandKnowledge: {
    findUnique: async ({ where }: any) => clone(records.get(where.brandId)),
    upsert: async ({ where, create, update }: any) => {
      const row = records.has(where.brandId) ? { ...records.get(where.brandId), ...clone(update) } : clone(create)
      records.set(where.brandId, row); return clone(row)
    },
  },
  voiceTask: {
    findFirst: async ({ where }: any) => clone([...tasks.values()].find(t => matches(t, where))),
    findUnique: async ({ where }: any) => clone([...tasks.values()].find(t => matches(t, where))),
    findUniqueOrThrow: async (args: any) => { const t = await db.voiceTask.findUnique(args); assert.ok(t); return t },
    create: async ({ data }: any) => {
      if ([...tasks.values()].some(t => t.brandId === data.brandId && t.kind === data.kind && t.requestKey === data.requestKey)) throw Object.assign(new Error('duplicate'), { code: 'P2002' })
      const t = { status: 'queued', leaseToken: null, leaseUntil: null, result: null, error: null, ...clone(data) }
      tasks.set(t.id, t); return clone(t)
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0
      for (const t of tasks.values()) if (matches(t, where)) { Object.assign(t, clone(data)); count++ }
      return { count }
    },
    update: async ({ where, data }: any) => { const t = tasks.get(where.id); Object.assign(t, clone(data)); return clone(t) },
    upsert: async ({ where, create }: any) => await db.voiceTask.findUnique({ where }) || db.voiceTask.create({ data: create }),
  },
}
const config = { id: 'config-one', apiKey: 'fake-key', baseUrl: 'https://api.minimaxi.com/v1/t2a_v2', provider: 'minimax', modelName: 'speech-2.8-hd' }
let rejectUpload = false
let failTts = false
let failText = ''
const ttsCalls: any[] = []
const providerCalls: any[] = []
const providerVoices = new Set<string>()
const activatedVoices = new Set<string>()
const require = createRequire(import.meta.url)
const modules: Record<string, any> = {
  '@/lib/miniMaxEndpoints': miniMaxEndpoints,
  '@/lib/miniMaxVoiceResponse': miniMaxVoiceResponse,
  '@/lib/prisma': { prisma: db },
  '@/lib/model-management/runtime': { selectedExecution: async () => null, recordExecution: async () => {} },
  './model-management/delegatedMedia': { delegateMedia: async () => null },
  '@/lib/voiceAudioValidation': { inspectVoiceAudio, measureAudioDuration: async () => 1, MAX_VOICE_BYTES: 20_000_000 },
  '@/lib/ttsGeneration': {
    getActiveMiniMaxTtsConfigs: async () => [config],
    generateTtsAudio: async (input: any) => {
      ttsCalls.push(input)
      if (failTts || input.text === failText) throw new Error('synthetic TTS failure')
      activatedVoices.add(input.voiceId)
      return { audio: wav(1), contentType: 'audio/wav' }
    },
  },
  '@/lib/integrations/huaweiObs': {
    uploadHuaweiObsObject: async (input: any) => { assert.equal(input.private, true); return { ok: true, key: input.key, url: 'https://obs.test/source' } },
    getHuaweiObsPrivateUrl: (key: string) => `https://obs.test/${key}?signed=1`,
    deleteHuaweiObsObject: async () => ({ ok: true }),
  },
}
const source = ts.transpileModule(readFileSync(new URL('../src/lib/brandVoiceProfiles.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} as any }
runInNewContext(source, { module, exports: module.exports, require: (id: string) => modules[id] || require(id), Buffer, URL, Blob, FormData, AbortSignal, console, structuredClone,
  fetch: async (url: string, init: any = {}) => {
    if (url.startsWith('https://obs.test')) return init.method === 'HEAD' ? new Response(null, { status: 403 }) : new Response(wav(10))
    const path = new URL(url).pathname
    const body = init.body instanceof FormData ? {} : miniMaxVoiceResponse.parseMiniMaxVoiceJson(init.body)
    providerCalls.push({ path, body })
    if (path === '/v1/files/upload') return new Response(rejectUpload
      ? '{"base_resp":{"status_code":1004,"status_msg":"authentication failed"}}'
      : '{"file":{"file_id":123456789012345681},"base_resp":{"status_code":0}}')
    if (path === '/v1/voice_clone') { assert.equal(body.file_id, '123456789012345681'); assert.ok(!('text_validation' in body)); providerVoices.add(body.voice_id) }
    return Response.json({ base_resp: { status_code: 0 }, file: { file_id: 123 }, voice_cloning: [...activatedVoices].map(voice_id => ({ voice_id })) })
  },
})
const service = module.exports
const file = new File([wav(10)], 'sample.wav', { type: 'audio/wav' })
const input = { brandId: 'brand-a', file, label: 'Owner', actorId: 'actor', requestKey: 'request-one' }
const first = await service.createBrandVoiceProfile(input)
assert.equal(first.profiles[0].status, 'processing')
await service.createBrandVoiceProfile(input)
assert.equal(tasks.size, 1, 'double submit is idempotent')
await Promise.all([service.runVoiceTask(), service.runVoiceTask()])
let list = await service.listBrandVoiceProfiles('brand-a')
const id = list.profiles[0].id
assert.equal(list.profiles[0].status, 'ready', JSON.stringify([...tasks.values()]))
assert.equal(list.defaultBrandVoiceProfileId, id)
assert.equal(providerCalls.filter(c => c.path === '/v1/voice_clone').length, 1)
assert.equal(ttsCalls[0].configId, 'config-one')
await service.updateBrandVoiceProfile('brand-a', id, { label: 'Renamed' })
assert.equal((await service.listBrandVoiceProfiles('brand-a')).defaultBrandVoiceProfileId, id, 'rename preserves default')
await assert.rejects(service.resolveBrandVoiceSelection('brand-b', { brandVoiceProfileId: id }), /NOT_READY/)
await assert.rejects(service.updateBrandVoiceProfile('brand-a', id, { status: 'ready' }), /managed/)
const selection = await service.resolveBrandVoiceSelection('brand-a', { brandVoiceProfileId: id })
config.apiKey = 'different-account'
await assert.rejects(service.assertSelection('brand-a', selection), /CONFIG_UNAVAILABLE/)
config.apiKey = 'fake-key'

failTts = true
const second = await service.createBrandVoiceProfile({ ...input, requestKey: 'request-two', label: 'Chef' })
await service.runVoiceTask()
list = await service.listBrandVoiceProfiles('brand-a')
const failed = list.profiles.find((p: any) => p.taskId === second.taskId)
assert.equal(failed.status, 'failed', 'activation failure cannot become ready')
assert.equal(list.defaultBrandVoiceProfileId, id)
failTts = false
await service.updateBrandVoiceProfile('brand-a', failed.id, { retry: true })
await service.runVoiceTask()
assert.equal(providerCalls.filter(c => c.path === '/v1/voice_clone').length, 2, 'retry reconciles existing clone instead of cloning twice')
assert.equal((await service.listBrandVoiceProfiles('brand-a')).profiles.find((p: any) => p.id === failed.id).status, 'ready')

const segments = [{ text: 'first', shotIndex: 0, shotDurationSec: 4 }, { text: 'second', shotIndex: 1, shotDurationSec: 4 }]
failText = 'second'
const narration = await service.createVoiceoverTask('brand-a', { actorId: 'actor', requestKey: 'video-one-narration', selection, segments })
await service.runVoiceTask()
assert.equal(tasks.get(narration.id).status, 'failed')
assert.equal(tasks.get(narration.id).result.segments.length, 1)
failText = ''
await service.createVoiceoverTask('brand-a', { actorId: 'actor', requestKey: 'video-one-narration', selection, segments })
await service.runVoiceTask()
assert.equal(tasks.get(narration.id).status, 'completed')
assert.equal(ttsCalls.filter(c => c.text === 'first').length, 1, 'retry reuses successful audio')
const publicTask = service.publicVoiceTask(tasks.get(narration.id))
assert.equal(publicTask.segments.length, 2)
assert.equal(publicTask.segments[0].durationSec, 1)
assert.ok(publicTask.segments[0].url.includes('signed=1'))
await assert.rejects(service.createVoiceoverTask('brand-a', { actorId: 'actor', requestKey: 'video-one-narration', selection, segments: [segments[1]] }), /conflict/)
await service.disableBrandVoiceProfile('brand-a', id)
await assert.rejects(service.assertSelection('brand-a', selection), /DISABLED/)
assert.equal((await service.listBrandVoiceProfiles('brand-a')).defaultBrandVoiceProfileId, null)

const third = await service.createBrandVoiceProfile({ ...input, requestKey: 'request-three', label: 'Staff' })
const uncertain = tasks.get(third.taskId)
uncertain.status = 'running'; uncertain.leaseToken = 'dead-worker'; uncertain.leaseUntil = new Date(0)
uncertain.payload.cloneSubmitted = true
providerVoices.add(uncertain.payload.profile.providerVoiceId)
const cloneCount = providerCalls.filter(c => c.path === '/v1/voice_clone').length
await service.runVoiceTask()
assert.equal(tasks.get(third.taskId).status, 'completed', 'expired worker lease resumes uncertain inactive clone')
assert.equal(providerCalls.filter(c => c.path === '/v1/voice_clone').length, cloneCount, 'an inactive voice missing from get_voice must not be cloned twice')
await Promise.all([
  service.updateBrandVoiceProfile('brand-a', failed.id, { label: 'Chef updated' }),
  service.updateBrandVoiceProfile('brand-a', third.taskId, { label: 'Staff updated' }),
])
list = await service.listBrandVoiceProfiles('brand-a')
assert.ok(list.profiles.some((p: any) => p.label === 'Chef updated'))
assert.ok(list.profiles.some((p: any) => p.label === 'Staff updated'))

rejectUpload = true
const beforeRejection = providerCalls.filter(c => c.path === '/v1/voice_clone').length
const rejectedTask = await service.createBrandVoiceProfile({ ...input, requestKey: 'request-upload-rejected' })
await service.runVoiceTask()
assert.equal(tasks.get(rejectedTask.taskId).status, 'failed')
const rejectedProfile = (await service.listBrandVoiceProfiles('brand-a')).profiles.find((p: any) => p.id === rejectedTask.taskId)
assert.equal(rejectedProfile.errorStage, 'upload')
assert.match(rejectedProfile.error, /1004.*authentication failed/)
assert.equal(providerCalls.filter(c => c.path === '/v1/voice_clone').length, beforeRejection)
rejectUpload = false
await service.updateBrandVoiceProfile('brand-a', rejectedTask.taskId, { retry: true })
await service.runVoiceTask()
assert.equal(tasks.get(rejectedTask.taskId).status, 'completed')
assert.equal(tasks.get(rejectedTask.taskId).payload.fileId, '123456789012345681')

// Exercise the real TTS adapter guard and pinned-config loop separately.
db.lLMConfig = { findMany: async () => [{ ...config, taskTags: ['tts'] }, { ...config, id: 'other-account', apiKey: 'other-key', taskTags: ['tts'] }] }
const ttsModule = { exports: {} as any }
let realAdapterCalls = 0
const ttsSource = ts.transpileModule(readFileSync(new URL('../src/lib/ttsGeneration.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
runInNewContext(ttsSource, { module: ttsModule, exports: ttsModule.exports, require: (id: string) => modules[id] || require(id), Buffer, AbortController, setTimeout, clearTimeout, console,
  fetch: async () => { realAdapterCalls++; return Response.json({ base_resp: { status_code: 1000, status_msg: 'provider failure' } }) },
})
await assert.rejects(ttsModule.exports.generateTtsAudio({ text: 'test', voiceId: selection.providerVoiceId }), /verified brand/)
await assert.rejects(ttsModule.exports.generateTtsAudio({ text: 'test', voiceId: selection.providerVoiceId, configId: 'config-one', brandId: 'brand-a' }), /not available/)
const valid = list.profiles.find((p: any) => p.id === failed.id)
await assert.rejects(ttsModule.exports.generateTtsAudio({ text: 'test', voiceId: valid.providerVoiceId, configId: 'config-one', brandId: 'brand-a' }), /provider failure/)
assert.equal(realAdapterCalls, 1, 'a pinned merchant voice never tries a second MiniMax account')
console.log('PASS: real audio validation; clone activation, leases, idempotency, account binding, brand isolation, default preservation and narration retry reuse')
