import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as endpoints from '../src/lib/miniMaxEndpoints.ts'

const primary = { id: 'primary', provider: 'minimax', modelName: 'speech-2.8-hd', apiKey: 'primary-key', baseUrl: null, taskTags: ['tts'] }
const other = { ...primary, id: 'other', apiKey: 'other-key' }
let configs = [primary, other]
let reject = true
const calls: any[] = []
const prisma = { lLMConfig: { findMany: async () => configs } }
const module = { exports: {} as any }
const source = ts.transpileModule(readFileSync(new URL('../src/lib/ttsGeneration.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
runInNewContext(source, { module, exports: module.exports, Buffer, AbortController, setTimeout, clearTimeout, console,
  require: (id: string) => {
    if (id === '@/lib/prisma') return { prisma }
    if (id === '@/lib/miniMaxEndpoints') return endpoints
    throw new Error(`Unexpected import: ${id}`)
  },
  fetch: async (url: string, options: any) => {
    calls.push({ url, options })
    assert.equal(url, 'https://api.minimaxi.com/v1/t2a_v2')
    assert.equal(options.redirect, 'error')
    return Response.json(reject ? { base_resp: { status_code: 2049, status_msg: 'invalid api key' } }
      : { base_resp: { status_code: 0 }, data: { audio: 'ff' } })
  },
})
const service = module.exports
await assert.rejects(service.generateTtsAudio({ text: 'test' }), /2049/)
assert.equal(calls.length, 1, 'Failed default request must not try another key')
assert.equal(calls[0].options.headers.Authorization, 'Bearer primary-key')
configs = [other, primary]
await assert.rejects(service.generateTtsAudio({ text: 'test', configId: 'primary' }), /2049/)
assert.equal(calls.length, 2)
assert.equal(calls[1].options.headers.Authorization, 'Bearer primary-key', 'Configuration order must not change a pinned voice')
configs = [other]
await assert.rejects(service.generateTtsAudio({ text: 'test', configId: 'primary' }), /CONFIG_UNAVAILABLE/)
assert.equal(calls.length, 2, 'Missing original configuration must fail before any request')
reject = false
const result = await service.generateTtsAudio({ text: 'test', configId: 'other' })
assert.equal(result.provenance.profileId, 'other')
assert.equal(result.provenance.fallbackPath.length, 0)
configs = [{ ...primary, baseUrl: 'https://api.minimax.io/v1/t2a_v2' } as any, other]
await assert.rejects(service.generateTtsAudio({ text: 'test' }), /DOMESTIC_ENDPOINT_REQUIRED/)
assert.equal(calls.length, 3, 'International configuration must not trigger any request or fallback')
console.log('PASS: domestic TTS only, no account fallback, pinned configuration survives ordering changes')
