/**
 * AI Marketing Crew MCP endpoint — Streamable HTTP (Web Fetch API)
 *
 * Compatible with MCP SDK v1.x WebStandardStreamableHTTPServerTransport.
 * Works natively in Next.js App Router (no Node.js req/res needed).
 *
 * ─── Client config for Claude Desktop / Hermes ───────────────────────────
 * {
 *   "mcpServers": {
 *     "amc-kanban": {
 *       "url": "https://amc-kanban.immedi.ai/api/mcp",
 *       "headers": { "Authorization": "Bearer <AGENT_API_KEY>" }
 *     }
 *   }
 * }
 * ─────────────────────────────────────────────────────────────────────────
 */

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createAmcMcpServer, getAgentFromKey } from '@/lib/mcp/server'

export const dynamic = 'force-dynamic'

async function handleMcp(request: Request): Promise<Response> {
  // Validate agent API key from Authorization header
  const authHeader = request.headers.get('authorization') || ''
  const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Missing Authorization header. Use: Authorization: Bearer <AGENT_API_KEY>' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const agent = await getAgentFromKey(apiKey)
  if (!agent) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired agent API key' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Create a fresh transport + server per request (stateless, Render-friendly)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  const mcpServer = createAmcMcpServer(apiKey)

  await mcpServer.connect(transport)
  const response = await transport.handleRequest(request)
  return response
}

export async function GET(request: Request) { return handleMcp(request) }
export async function POST(request: Request) { return handleMcp(request) }
export async function DELETE(request: Request) { return handleMcp(request) }
