import assert from 'node:assert/strict'
import { createServer } from 'node:http'

// llmRouter also exposes the database-backed production entrypoint. A syntactically
// valid URL keeps Prisma lazy for this isolated routing test; no connection is made.
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test'
const { callLLMWithConfigs } = await import('../src/lib/llmRouter.ts')

const requests: Array<{ token: string; body: any }> = []
let abortedRequests = 0

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  requests.push({ token, body })

  if (token === 'slow-token' || token === 'cancel-token') {
    res.once('close', () => {
      if (!res.writableEnded) abortedRequests += 1
    })
    setTimeout(() => {
      if (res.writableEnded || res.destroyed) return
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { content: '{"late":true}' } }] }))
    }, 250)
    return
  }

  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }))
})

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert(address && typeof address === 'object')
const baseUrl = `http://127.0.0.1:${address.port}`

try {
  const jsonResult = await callLLMWithConfigs([
    {
      provider: 'custom_shim',
      modelName: 'fast-json',
      baseUrl,
      apiKey: 'fast-token',
      displayName: 'Fast JSON',
    },
  ], 'Return JSON', 2400, {
    jsonMode: true,
    temperature: 0.2,
    deadlineMs: 500,
    attemptTimeoutMs: [300],
    maxAttempts: 1,
  })
  assert.equal(jsonResult.text, '{"ok":true}')
  assert.equal(jsonResult.attempts?.length, 1)
  assert.equal(jsonResult.attempts?.[0].status, 'success')
  assert.equal(requests[0].body.response_format?.type, 'json_object')
  assert.equal(requests[0].body.temperature, 0.2)
  assert.equal(requests[0].body.max_tokens, 2400)

  const fallbackStartedAt = Date.now()
  const fallbackResult = await callLLMWithConfigs([
    {
      provider: 'custom_shim',
      modelName: 'slow-primary',
      baseUrl,
      apiKey: 'slow-token',
      displayName: 'Slow primary',
    },
    {
      provider: 'custom_shim',
      modelName: 'fast-fallback',
      baseUrl,
      apiKey: 'fast-token',
      displayName: 'Fast fallback',
    },
  ], 'Return JSON', 1200, {
    jsonMode: true,
    deadlineMs: 300,
    attemptTimeoutMs: [60, 120],
    maxAttempts: 2,
  })
  assert.equal(fallbackResult.text, '{"ok":true}')
  assert.equal(fallbackResult.attempts?.[0].status, 'timeout')
  assert.equal(fallbackResult.attempts?.[1].status, 'success')
  assert(Date.now() - fallbackStartedAt < 250)

  const controller = new AbortController()
  setTimeout(() => controller.abort(), 30)
  const cancelledStartedAt = Date.now()
  const cancelledResult = await callLLMWithConfigs([
    {
      provider: 'custom_shim',
      modelName: 'cancelled-primary',
      baseUrl,
      apiKey: 'cancel-token',
      displayName: 'Cancelled primary',
    },
  ], 'Return JSON', 1200, {
    signal: controller.signal,
    deadlineMs: 1000,
    attemptTimeoutMs: [900],
    maxAttempts: 1,
  })
  assert.equal(cancelledResult.text, null)
  assert.equal(cancelledResult.attempts?.[0].status, 'aborted')
  assert(Date.now() - cancelledStartedAt < 200)

  await new Promise((resolve) => setTimeout(resolve, 50))
  assert(abortedRequests >= 1)
  console.log('LLM routing policy tests passed.')
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
