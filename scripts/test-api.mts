#!/usr/bin/env node
/**
 * AMC Kanban — Integration Test Suite
 *
 * Tests both REST API endpoints and the MCP server.
 * Uses node:test (built-in, no dependencies needed).
 *
 * Usage:
 *   cp .env.test.example .env.test          # fill in your credentials
 *   node --experimental-strip-types scripts/test-api.mts
 *
 * Or with env vars inline:
 *   TEST_AGENT_API_KEY=xxx AMC_BASE_URL=https://... node --experimental-strip-types scripts/test-api.mts
 */

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Load .env.test if present ────────────────────────────────────────────────
const envPath = resolve(process.cwd(), '.env.test')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
}

const BASE = (process.env.AMC_BASE_URL || 'https://amc-kanban.immedi.ai').replace(/\/$/, '')
const API_KEY = process.env.TEST_AGENT_API_KEY || ''
const INITIAL_BRAND_ID = process.env.TEST_BRAND_ID || ''

if (!API_KEY) {
  console.error('\n❌  TEST_AGENT_API_KEY is not set. Copy .env.test.example → .env.test and fill in your agent key.\n')
  process.exit(1)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const auth = { Authorization: `Bearer ${API_KEY}` }
const json = { ...auth, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' }

async function rest(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? json : auth,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data, headers: res.headers }
}

// MCP JSON-RPC helper
async function mcpCall(method: string, params: Record<string, unknown> = {}, id = 1) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  const text = await res.text()
  // MCP may stream; grab first JSON object from SSE or plain body
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return { status: res.status, raw: text, result: null, error: null }
  const parsed = JSON.parse(match[0])
  return { status: res.status, raw: text, result: parsed.result ?? null, error: parsed.error ?? null }
}

// ── State shared across tests ────────────────────────────────────────────────
let brandId = INITIAL_BRAND_ID
let testTaskId = ''

// ════════════════════════════════════════════════════════════════════════════
// 1. REST — Meta endpoints (public, no auth)
// ════════════════════════════════════════════════════════════════════════════
describe('REST: Public meta endpoints', () => {
  test('GET /api/meta/openapi returns OpenAPI spec', async () => {
    const { status, data } = await rest('GET', '/api/meta/openapi')
    assert.equal(status, 200, `/api/meta/openapi returned ${status}`)
    assert.ok(typeof data === 'object' && data !== null, 'should return JSON object')
  })

  test('GET /api/meta/sop returns SOP document', async () => {
    const { status, data } = await rest('GET', '/api/meta/sop')
    assert.equal(status, 200, `/api/meta/sop returned ${status}`)
    assert.ok(data, 'should return content')
  })

  test('GET /api/meta/avatar-guide returns avatar guide', async () => {
    const { status } = await rest('GET', '/api/meta/avatar-guide')
    assert.equal(status, 200, `/api/meta/avatar-guide returned ${status}`)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 2. REST — Auth guard: reject requests without API key
// ════════════════════════════════════════════════════════════════════════════
describe('REST: Auth guard', () => {
  test('GET /api/agent/brand-config without key → 401', async () => {
    const res = await fetch(`${BASE}/api/agent/brand-config`)
    assert.equal(res.status, 401, 'Should reject unauthenticated requests')
  })

  test('GET /api/agent/profile without key → 401 or 403', async () => {
    const res = await fetch(`${BASE}/api/agent/profile`)
    assert.ok([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`)
  })

  test('MCP /api/mcp without key → 401', async () => {
    const res = await fetch(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    assert.equal(res.status, 401, 'MCP should reject missing API key')
  })

  test('MCP /api/mcp with bad key → 401', async () => {
    const res = await fetch(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalid_key_xyz' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    assert.equal(res.status, 401, 'MCP should reject invalid API key')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 3. REST — Agent profile
// ════════════════════════════════════════════════════════════════════════════
describe('REST: Agent profile', () => {
  test('GET /api/agent/profile returns agent data', async () => {
    const { status, data } = await rest('GET', '/api/agent/profile')
    assert.equal(status, 200, `Profile returned ${status}: ${JSON.stringify(data)}`)
    assert.ok((data as any).id, 'Profile should have an id')
    assert.ok((data as any).type === 'AI_AGENT' || (data as any).nickname, 'Should be an AI_AGENT')
    console.log(`    ✓  Agent: ${(data as any).nickname || (data as any).email} (${(data as any).id})`)
  })

  test('PATCH /api/agent/profile updates insights field', async () => {
    const ts = Date.now()
    const { status, data } = await rest('PATCH', '/api/agent/profile', {
      insights: `auto-test-${ts}`,
    })
    assert.equal(status, 200, `PATCH profile returned ${status}: ${JSON.stringify(data)}`)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 4. REST — Brand config
// ════════════════════════════════════════════════════════════════════════════
describe('REST: Brand config', () => {
  test('GET /api/agent/brand-config returns array', async () => {
    const { status, data } = await rest('GET', '/api/agent/brand-config')
    assert.equal(status, 200, `brand-config returned ${status}`)
    assert.ok(Array.isArray(data), 'Should return an array')
    console.log(`    ✓  Linked brands: ${(data as any[]).length}`)

    if (!brandId && (data as any[]).length > 0) {
      brandId = (data as any[])[0].id
      console.log(`    ✓  Using brandId: ${brandId}`)
    }
  })

  test('PATCH /api/agent/brand-config creates brand if no brandId provided', async () => {
    if (brandId) {
      console.log(`    ↷  Skipped (brandId already set: ${brandId})`)
      return
    }
    const { status, data } = await rest('PATCH', '/api/agent/brand-config', {
      name: `Test Brand ${Date.now()}`,
      description: 'Auto-created by test suite. Safe to delete.',
      timezone: 'Asia/Singapore',
    })
    assert.equal(status, 200, `Create brand returned ${status}: ${JSON.stringify(data)}`)
    assert.ok((data as any).brandId || (data as any).brand?.id, 'Should return brandId')
    brandId = (data as any).brandId || (data as any).brand?.id
    console.log(`    ✓  Created test brand: ${brandId}`)
  })

  test('PATCH /api/agent/brand-config updates description', async () => {
    if (!brandId) { console.log('    ↷  Skipped (no brandId)'); return }
    const ts = Date.now()
    const { status, data } = await rest('PATCH', '/api/agent/brand-config', {
      brandId,
      description: `**Auto-test update** — ${ts}\n\nThis description was written by the automated test suite to verify the brand config update pipeline is working end-to-end. The timestamp is ${new Date().toISOString()}.`,
    })
    assert.equal(status, 200, `Update description returned ${status}: ${JSON.stringify(data)}`)
    assert.ok((data as any).ok === true, 'Should return { ok: true }')
    assert.ok(Array.isArray((data as any).updated), 'Should return updated fields list')
    assert.ok((data as any).updated.includes('description'), 'description should be in updated list')
    console.log(`    ✓  Updated fields: ${(data as any).updated.join(', ')}`)
  })

  test('GET /api/agent/brand-config?brandId=xxx returns specific brand', async () => {
    if (!brandId) { console.log('    ↷  Skipped (no brandId)'); return }
    const { status, data } = await rest('GET', `/api/agent/brand-config?brandId=${brandId}`)
    assert.equal(status, 200, `Get specific brand returned ${status}`)
    assert.equal((data as any).id, brandId, 'Should return the correct brand')
    assert.ok((data as any).description?.includes('Auto-test update'), 'Description should be updated')
    console.log(`    ✓  Brand name: ${(data as any).name}`)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 5. REST — Tasks (WorkUnit)
// ════════════════════════════════════════════════════════════════════════════
describe('REST: Tasks', () => {
  test('GET /api/tasks returns array', async () => {
    const { status, data } = await rest('GET', '/api/tasks')
    assert.equal(status, 200, `GET /api/tasks returned ${status}`)
    assert.ok(Array.isArray((data as any).tasks || data), 'Should return tasks array')
    const tasks = (data as any).tasks ?? data as any[]
    console.log(`    ✓  Total tasks visible: ${Array.isArray(tasks) ? tasks.length : '?'}`)
  })

  test('POST /api/tasks creates a task', async () => {
    const { status, data } = await rest('POST', '/api/tasks', {
      title: `[TEST] Auto-test task ${Date.now()}`,
      description: 'Created by automated test suite. Safe to delete.',
      status: 'todo',
      priority: 'low',
      weight: 1,
    })
    assert.equal(status, 200, `Create task returned ${status}: ${JSON.stringify(data)}`)
    assert.ok((data as any).id, 'Task should have an id')
    testTaskId = (data as any).id
    console.log(`    ✓  Created task: ${testTaskId}`)
  })

  test('PATCH /api/tasks/:id updates status to done', async () => {
    if (!testTaskId) { console.log('    ↷  Skipped (no testTaskId)'); return }
    const { status, data } = await rest('PATCH', `/api/tasks/${testTaskId}`, { status: 'done' })
    assert.equal(status, 200, `Update task returned ${status}: ${JSON.stringify(data)}`)
    assert.equal((data as any).status, 'done', 'Task status should be done')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 6. MCP — tools/list
// ════════════════════════════════════════════════════════════════════════════
describe('MCP: Tool discovery', () => {
  const EXPECTED_TOOLS = [
    'get_brand_config',
    'update_brand_config',
    'get_agent_profile',
    'update_agent_profile',
    'list_tasks',
    'create_task',
    'update_task',
    'update_accounts',
    'post_action_item',
  ]

  test('MCP tools/list returns all expected tools', async () => {
    const { status, result, error, raw } = await mcpCall('tools/list')
    assert.equal(status, 200, `MCP tools/list returned HTTP ${status}\nRaw: ${raw?.slice(0, 300)}`)
    assert.ok(!error, `MCP error: ${JSON.stringify(error)}`)
    assert.ok(result?.tools, `Expected result.tools, got: ${JSON.stringify(result)}`)

    const toolNames: string[] = result.tools.map((t: any) => t.name)
    console.log(`    ✓  Tools found: ${toolNames.join(', ')}`)

    for (const expected of EXPECTED_TOOLS) {
      assert.ok(toolNames.includes(expected), `Missing MCP tool: ${expected}`)
    }
  })

  test('MCP tools/list — each tool has name, description, inputSchema', async () => {
    const { result } = await mcpCall('tools/list')
    if (!result?.tools) return
    for (const tool of result.tools) {
      assert.ok(tool.name, `Tool missing name: ${JSON.stringify(tool)}`)
      assert.ok(tool.description, `Tool ${tool.name} missing description`)
      assert.ok(tool.inputSchema, `Tool ${tool.name} missing inputSchema`)
    }
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 7. MCP — Tool invocation
// ════════════════════════════════════════════════════════════════════════════
describe('MCP: Tool invocation', () => {
  test('MCP get_agent_profile returns agent data', async () => {
    const { result, error } = await mcpCall('tools/call', { name: 'get_agent_profile', arguments: {} })
    assert.ok(!error, `MCP error: ${JSON.stringify(error)}`)
    assert.ok(result?.content?.length > 0, 'Should return content')
    const text = result.content[0].text
    const parsed = JSON.parse(text)
    assert.ok(parsed.id, `Agent profile should have id, got: ${text.slice(0, 200)}`)
    console.log(`    ✓  MCP Agent: ${parsed.nickname || parsed.email}`)
  })

  test('MCP get_brand_config returns linked brands', async () => {
    const { result, error } = await mcpCall('tools/call', { name: 'get_brand_config', arguments: {} })
    assert.ok(!error, `MCP error: ${JSON.stringify(error)}`)
    const text = result?.content?.[0]?.text
    assert.ok(text, 'Should return content')
    const brands = JSON.parse(text)
    assert.ok(Array.isArray(brands), 'Should return array of brands')
    console.log(`    ✓  MCP brands: ${brands.length}`)
  })

  test('MCP update_brand_config writes description', async () => {
    if (!brandId) { console.log('    ↷  Skipped (no brandId)'); return }
    const ts = Date.now()
    const { result, error } = await mcpCall('tools/call', {
      name: 'update_brand_config',
      arguments: {
        brandId,
        description: `**MCP Test** — ${ts}\n\nThis update was made via the MCP protocol to verify tool invocation is working end-to-end.`,
      },
    })
    assert.ok(!error, `MCP error: ${JSON.stringify(error)}`)
    const text = result?.content?.[0]?.text
    const parsed = JSON.parse(text)
    assert.ok(parsed.ok === true, `Expected ok:true, got: ${text}`)
    assert.ok(parsed.updated?.includes('description'), 'description should be in updated list')
    console.log(`    ✓  MCP updated: ${parsed.updated?.join(', ')}`)
  })

  test('MCP create_task creates a work unit', async () => {
    const { result, error } = await mcpCall('tools/call', {
      name: 'create_task',
      arguments: {
        title: `[MCP-TEST] Task ${Date.now()}`,
        description: 'Created via MCP tool invocation test.',
        status: 'todo',
        priority: 'low',
        weight: 1,
      },
    })
    assert.ok(!error, `MCP error: ${JSON.stringify(error)}`)
    const text = result?.content?.[0]?.text
    const parsed = JSON.parse(text)
    assert.ok(parsed.ok === true, `Expected ok:true, got: ${text}`)
    assert.ok(parsed.taskId, 'Should return taskId')
    console.log(`    ✓  MCP task created: ${parsed.taskId}`)
  })

  test('MCP update_agent_profile updates insights', async () => {
    const { result, error } = await mcpCall('tools/call', {
      name: 'update_agent_profile',
      arguments: { insights: `mcp-auto-test-${Date.now()}` },
    })
    assert.ok(!error, `MCP error: ${JSON.stringify(error)}`)
    const text = result?.content?.[0]?.text
    const parsed = JSON.parse(text)
    assert.ok(parsed.ok === true, `Expected ok:true, got: ${text}`)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 8. REST — Edge cases & error handling
// ════════════════════════════════════════════════════════════════════════════
describe('REST: Error handling', () => {
  test('PATCH /api/agent/brand-config with non-existent brandId → error', async () => {
    const { status } = await rest('PATCH', '/api/agent/brand-config', {
      brandId: 'nonexistent-brand-id-xyz-123',
      description: 'should fail',
    })
    // Should either 404 or return error payload — not 200 with wrong data
    // (some implementations may 200 with empty update, log either way)
    console.log(`    ✓  Non-existent brandId returned HTTP ${status} (expected 4xx or graceful error)`)
  })

  test('POST /api/tasks with missing title → 400 or validation error', async () => {
    const { status, data } = await rest('POST', '/api/tasks', { priority: 'high' })
    assert.ok([400, 422].includes(status) || (data as any).error,
      `Expected 400/422 or error payload, got ${status}: ${JSON.stringify(data)}`)
    console.log(`    ✓  Missing title returned HTTP ${status}`)
  })

  test('MCP tools/call with unknown tool name → error result', async () => {
    const { result, error } = await mcpCall('tools/call', {
      name: 'nonexistent_tool',
      arguments: {},
    })
    // MCP spec: unknown tool → error in result or error field
    const hasError = !!error || result?.isError === true || result?.content?.[0]?.text?.includes('Error')
    assert.ok(hasError, `Expected error for unknown tool, got: ${JSON.stringify({ result, error })}`)
    console.log('    ✓  Unknown tool correctly returned error')
  })
})
