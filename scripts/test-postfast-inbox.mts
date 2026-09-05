#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

const requests: Array<{ method?: string; url?: string; body?: unknown; headers: Record<string, string | string[] | undefined> }> = []
const server = createServer(async (request, response) => {
  let raw = ''
  for await (const chunk of request) raw += chunk
  requests.push({ method: request.method, url: request.url, body: raw ? JSON.parse(raw) : undefined, headers: request.headers })
  response.setHeader('Content-Type', 'application/json')
  if (request.url?.startsWith('/social-inbox/conversations?')) {
    response.end(JSON.stringify({ conversations: [{ id: 'conversation-1', platform: 'INSTAGRAM', unreadCount: 1, needsAttention: true }], totalCount: 1, pageInfo: { hasNextPage: false } }))
  } else if (request.url?.startsWith('/social-inbox/conversations/conversation-1/items')) {
    response.end(JSON.stringify({ data: [{ id: 'item-1', text: 'Hello', canReply: true, canPrivateReply: true, maxReplyLength: 250, maxPrivateReplyLengthBytes: 1000 }], totalCount: 1, pageInfo: { hasNextPage: false } }))
  } else if (request.url === '/social-inbox/items/item-1/reply') {
    assert.equal(request.method, 'POST')
    assert.deepEqual(JSON.parse(raw), { text: 'Thanks', idempotencyKey: 'reply-1' })
    response.end(JSON.stringify({ id: 'outbound-1' }))
  } else if (request.url === '/social-inbox/items/item-1/private-reply') {
    assert.equal(request.method, 'POST')
    assert.deepEqual(JSON.parse(raw), { text: 'Private', idempotencyKey: 'private-1' })
    response.end(JSON.stringify({ id: 'outbound-2' }))
  } else if (request.url === '/social-inbox/items/item-1/state') {
    assert.equal(request.method, 'POST')
    assert.deepEqual(JSON.parse(raw), { action: 'HIDE', idempotencyKey: 'state-1' })
    response.end(JSON.stringify({ id: 'item-1', state: 'HIDDEN' }))
  } else if (request.url === '/social-inbox/items/item-failure/reply') {
    response.statusCode = 422
    response.end(JSON.stringify({ message: 'Reply window expired' }))
  } else if (request.url === '/social-inbox/items/item-uncertain/reply') {
    request.socket.destroy()
  } else {
    response.end(JSON.stringify({ ok: true }))
  }
})

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('Mock server did not start')
process.env.POSTFAST_BASE_URL = `http://127.0.0.1:${address.port}`
const client = await import('../src/lib/integrations/postfast.ts')

const conversations = await client.postfastListInboxConversations('test-key', { limit: 20, page: 0 })
assert.equal(conversations.success, true)
assert.equal(conversations.conversations[0].platform, 'instagram')
assert.equal(conversations.total, 1)
assert.equal(conversations.hasNextPage, false)
const items = await client.postfastListInboxItems('test-key', 'conversation-1')
assert.equal(items.items[0].maxReplyLength, 250)
assert.equal(items.items[0].maxPrivateReplyLengthBytes, 1000)
assert.equal(items.total, 1)
assert.equal(items.hasNextPage, false)
assert.equal((await client.postfastReplyInboxItem({ apiKey: 'test-key', itemId: 'item-1', text: 'Thanks', idempotencyKey: 'reply-1' })).success, true)
assert.equal((await client.postfastPrivateReplyInboxItem({ apiKey: 'test-key', itemId: 'item-1', text: 'Private', idempotencyKey: 'private-1' })).success, true)
assert.equal((await client.postfastSetInboxItemState({ apiKey: 'test-key', itemId: 'item-1', state: 'HIDE', idempotencyKey: 'state-1' })).success, true)
const definiteFailure = await client.postfastReplyInboxItem({ apiKey: 'test-key', itemId: 'item-failure', text: 'Nope', idempotencyKey: 'reply-failure' })
assert.equal(definiteFailure.success, false)
assert.equal(definiteFailure.status, 422)
assert.equal(definiteFailure.error, 'Reply window expired')
const uncertainFailure = await client.postfastReplyInboxItem({ apiKey: 'test-key', itemId: 'item-uncertain', text: 'Retry', idempotencyKey: 'reply-uncertain' })
assert.equal(uncertainFailure.success, false)
assert.equal(uncertainFailure.status, 0)
const requestCountBeforeInvalidState = requests.length
const invalidState = await client.postfastSetInboxItemState({ apiKey: 'test-key', itemId: 'item-1', state: 'INVALID' as any, idempotencyKey: 'state-invalid' })
assert.equal(invalidState.success, false)
assert.equal(invalidState.status, 400)
assert.equal(requests.length, requestCountBeforeInvalidState)
assert.equal(requests.filter((request) => request.method === 'POST' || request.method === 'PATCH').every((request) => Boolean(request.headers['idempotency-key'])), true)
await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
console.log('PostFast inbox client tests passed')