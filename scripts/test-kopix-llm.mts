import assert from 'node:assert/strict'

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test'
const { callLLMWithConfigs, callLLM, callLLMChat, validateLLMConfig } = await import('../src/lib/llmRouter.ts')
const { prisma } = await import('../src/lib/prisma.ts')
const originalFetch = globalThis.fetch
const originalFindMany = prisma.lLMConfig.findMany
const requests: Array<{ url: string; body: any }> = []
let responseMode = 'ok'
const profile = {
  id: 'kopix-test', provider: 'kopix', modelName: 'glm-5.3',
  apiKey: 'test-only-key', baseUrl: null, displayName: 'Kopix test',
  isEnabled: true, isDefault: false, taskTags: ['marketing_plan'],
  contentGenerationTypes: [], priority: 0, maxRetries: 0,
}
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(String(init?.body))
  requests.push({ url: String(url), body })
  assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-only-key')
  if (responseMode === 'timeout') {
    await new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('test timeout guard')), 1000)
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(init.signal!.reason)
      }, { once: true })
    })
  }
  if (responseMode === 'denied') return new Response('Model not allowed', { status: 400 })
  if (responseMode === 'limited') return new Response('Rate limited', { status: 429 })
  return Response.json({ choices: [{ message: { content: responseMode === 'empty' ? '' : '{"ok":true}' } }] })
}
try {
  for (const baseUrl of [null, 'https://www.kopix.ai/v1/', 'https://www.kopix.ai/v1/chat/completions/']) {
    const result = await callLLMWithConfigs([{ ...profile, baseUrl }], 'Return JSON', 1024, { jsonMode: true })
    assert.equal(result.text, '{"ok":true}')
    const request = requests.at(-1)!
    assert.equal(request.url, 'https://www.kopix.ai/v1/chat/completions')
    assert.equal(request.body.model, 'glm-5.3')
    assert.equal(request.body.stream, false)
    assert.equal(request.body.response_format, undefined)
  }
  assert.equal((await validateLLMConfig('kopix', 'glm-5.3', profile.apiKey, null)).success, true)
  assert.equal(requests.at(-1)!.body.max_tokens, 1024)
  let enabled = true
  prisma.lLMConfig.findMany = async ({ where }: any) => {
    assert.equal(where.isEnabled, true, 'every routing query must exclude disabled profiles')
    return enabled && where.OR ? [profile] : []
  }
  const messages = [{ role: 'user' as const, content: 'Hello' }, { role: 'assistant' as const, content: 'Hi' }, { role: 'user' as const, content: 'Return JSON' }]
  await callLLMChat('marketing_plan', messages, 1024)
  assert.deepEqual(requests.at(-1)!.body.messages, messages)
  assert.equal(requests.at(-1)!.body.stream, false)
  assert.equal((await callLLM('marketing_plan', 'Return JSON', 1024, { allowSystemFallback: false })).text, '{"ok":true}')
  enabled = false
  const before = requests.length
  await callLLM('marketing_plan', 'Return JSON', 1024, { allowAnyFallback: true, allowSystemFallback: false })
  await callLLMChat('marketing_plan', messages, 1024)
  assert.equal(requests.length, before, 'disabled Kopix must never send a request')
  for (const mode of ['denied', 'empty', 'timeout', 'limited']) {
    responseMode = mode
    const result = await callLLMWithConfigs([profile], 'Hello', 1024, { attemptTimeoutMs: [20], maxAttempts: 1 })
    assert.equal(result.text, null)
    assert.ok(result.error)
    if (mode === 'timeout') assert.equal(result.attempts?.[0].status, 'timeout')
  }
  console.log('Kopix LLM tests passed: request, validation, chat, routing, disabled isolation and errors')
} finally {
  globalThis.fetch = originalFetch
  prisma.lLMConfig.findMany = originalFindMany
  await prisma.$disconnect()
}
