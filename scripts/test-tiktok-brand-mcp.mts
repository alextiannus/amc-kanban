import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { MCP_PERMISSIONS } from '../src/lib/role-permissions/mcp.ts'
import * as policy from '../src/lib/reviewChannelPolicy.ts'

let allowed = true
const requests: any[] = [], reservations: any[] = []
const principal = { userId: 'user', authVersion: 1, source: 'api_key' }
const user = { id: 'user', status: 'ACTIVE', authVersion: 1 }
const prisma = {
  user: { findUnique: async () => user },
  brand: { findUnique: async () => ({ postfastApiKey: 'fixture-only' }) },
  socialAccount: { findFirst: async ({ where }: any) => {
    assert.equal(where.brandId, 'brand'); assert.equal(where.id, 'account'); assert.equal(where.unboundAt, null)
    return { platformId: 'tiktok', postfastAccountId: 'provider-account' }
  } },
}
const deps: Record<string, any> = {
  '@modelcontextprotocol/sdk/server/mcp.js': { McpServer }, zod: { z },
  '@/lib/prisma': { prisma }, '@/lib/auth-v2': { authenticateApiKey: async () => principal },
  '@/lib/auth-v2/types': { principalFromUser: () => principal },
  '@/lib/role-permissions/store': { allows: async () => allowed },
  '@/lib/role-permissions/mcp': { MCP_PERMISSIONS }, '@/lib/reviewChannelPolicy': policy,
  '@/lib/user-management/brandAccess': { canUserAccessBrand: async () => allowed },
  '../../video-assistant/tools': { registerVideoTools: () => {} },
  '@/lib/audit': { writeAuditLog: async () => {} },
  '@/lib/postfastPublishIdempotency': {
    reservePostfastPublish: async (input: any) => { reservations.push(input); return {} },
    completePostfastPublish: async () => {},
  },
  '@/lib/integrations/postfast': { postfastPublish: async (input: any) => {
    requests.push(input); return { success: true, postId: 'fixture-post' }
  } },
  'node:fs': { statSync }, 'node:path': { join },
}
const compiled = ts.transpileModule(readFileSync('src/lib/partner/mcp/server.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const loaded = { exports: {} as any }
new Function('require', 'module', 'exports', compiled)((name: string) => {
  if (name in deps) return deps[name]
  return new Proxy({}, { get: () => () => { throw Error('Unexpected dependency execution: ' + name) } })
}, loaded, loaded.exports)
const server = loaded.exports.createAmcMcpServer(principal)
const client = new Client({ name: 'fixture-client', version: '1' })
const [a, b] = InMemoryTransport.createLinkedPair()
try {
  await server.connect(b); await client.connect(a)
  const listed = await client.listTools()
  for (const name of ['publish', 'board_publish_content', 'postfast_publish']) {
    const tool = listed.tools.find(t => t.name === name)!
    const props = (tool.inputSchema.properties!.postfastControls as any).properties
    assert.equal(props.tiktokBrandOrganic.type, 'boolean')
    for (const value of [true, false, undefined]) {
      const arguments_ = {
        brandId: 'brand', accountId: 'account', platform: 'tiktok', caption: 'Own-brand fixture',
        idempotencyKey: 'fixture-' + name + value,
        postfastControls: { ...(value === undefined ? {} : { tiktokBrandOrganic: value }), tiktokIsAigc: false, firstComment: 'Preserved' },
      }
      const result = await client.callTool({ name, arguments: arguments_ })
      assert.notEqual(result.isError, true, JSON.stringify(result))
      assert.equal(requests.at(-1).tiktokBrandOrganic, value)
      assert.equal(requests.at(-1).tiktokIsAigc, false)
      assert.equal(requests.at(-1).firstComment, 'Preserved')
      assert.equal(reservations.at(-1).payload.postfastControls.tiktokBrandOrganic, value)
    }
    for (const value of ['true', 1, null, {}, []]) {
      const count = requests.length
      const result = await client.callTool({ name, arguments: {
        brandId: 'brand', accountId: 'account', platform: 'tiktok', caption: 'Invalid',
        idempotencyKey: 'invalid', postfastControls: { tiktokBrandOrganic: value },
      } })
      assert.equal(result.isError, true)
      assert.equal(requests.length, count, 'MCP schema must reject non-booleans before publication')
    }
  }
  allowed = false
  const count = requests.length
  const denied = await client.callTool({ name: 'publish', arguments: {
    brandId: 'brand', accountId: 'account', platform: 'tiktok', caption: 'Denied', idempotencyKey: 'denied',
    postfastControls: { tiktokBrandOrganic: true },
  } })
  assert.equal(denied.isError, true); assert.equal(requests.length, count)
  console.log('PASS actual MCP transport: own-brand field discoverable on all aliases; boolean validation, handler and idempotency payload preserved; authorization retained; provider mocked')
} finally { await client.close(); await server.close() }
