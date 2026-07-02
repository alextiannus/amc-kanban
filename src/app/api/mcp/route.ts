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
import { createAmcMcpServer } from '@/lib/partner/mcp/server'
import { prisma } from '@/lib/prisma'
import { verifyUserApiKey } from '@/lib/user-management/auth'

export const dynamic = 'force-dynamic'

async function handleMcp(request: Request): Promise<Response> {
  // Validate API key from Authorization header
  const authHeader = request.headers.get('authorization') || ''
  const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Missing Authorization header. Use: Authorization: Bearer <PERSONAL_API_KEY>' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const user = await verifyUserApiKey(apiKey)
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired API key' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Resolve AI Agent ID (defaults to the human user's single AI avatar if header is missing)
  let agentId = request.headers.get('x-agent-id')?.trim() || null
  if (!agentId) {
    const avatars = await prisma.user.findMany({
      where: { ownerId: user.id, type: 'AI_AGENT' },
      select: { id: true }
    })
    if (avatars.length === 1) {
      agentId = avatars[0].id
    }
  }

  if (!agentId) {
    return new Response(
      JSON.stringify({ error: 'No active AI Agent found or specified for this delegated user' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Intercept POST request for direct uploads
  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') || ''
    const clone = request.clone()

    if (contentType.includes('text/markdown') || contentType.includes('text/plain')) {
      try {
        const markdown = await clone.text()
        if (!markdown.trim()) {
          return new Response(
            JSON.stringify({ error: 'markdown content is empty' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          )
        }
        const url = new URL(request.url)
        let title = url.searchParams.get('title') || ''
        const desc = url.searchParams.get('desc') || ''
        if (!title) {
          const match = markdown.match(/^\s*#\s+(.+)$/m)
          title = match ? match[1].trim() : '未命名自媒体文章'
        }
        const item = await prisma.schoolItem.create({
          data: {
            type: 'ARTICLE',
            title,
            desc: desc || null,
            markdown,
            authorId: agentId
          }
        })
        return new Response(
          JSON.stringify({ success: true, item }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      } catch (err) {
        return new Response(
          JSON.stringify({ error: 'Failed to process markdown upload' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    if (contentType.includes('application/json')) {
      try {
        const body = await clone.json()
        if (body && typeof body === 'object' && !('jsonrpc' in body)) {
          // Direct JSON upload
          const { title, desc, markdown } = body
          if (!markdown) {
            return new Response(
              JSON.stringify({ error: 'markdown is required' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
          }
          const item = await prisma.schoolItem.create({
            data: {
              type: 'ARTICLE',
              title: title || '未命名文章',
              desc: desc || null,
              markdown,
              authorId: agentId
            }
          })
          return new Response(
            JSON.stringify({ success: true, item }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        }
      } catch (e) {
        // Fall through to standard MCP transport if JSON parsing fails
      }
    }
  }

  // Create a fresh transport + server per request (stateless, Render-friendly)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  const mcpServer = createAmcMcpServer(apiKey, agentId)

  await mcpServer.connect(transport)
  const response = await transport.handleRequest(request)
  return response
}

export async function GET(request: Request) { return handleMcp(request) }
export async function POST(request: Request) { return handleMcp(request) }
export async function DELETE(request: Request) { return handleMcp(request) }
