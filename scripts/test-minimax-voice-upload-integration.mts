import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import * as responseHelpers from '../src/lib/miniMaxVoiceResponse.ts'

const require = createRequire(import.meta.url)
const config = { id: 'test', apiKey: 'test-secret', baseUrl: 'https://api.minimax.io/v1/t2a_v2' }
const calls: any[] = []
let rejected = true
const modules: Record<string, any> = {
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
