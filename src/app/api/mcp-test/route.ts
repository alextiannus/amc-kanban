import { authenticateRequest } from '@/lib/auth-v2/authenticate'
import { NextResponse } from 'next/server'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const principal = await authenticateRequest(request)
  if (!principal) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!principal.globalRoles.includes('ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const log: string[] = []
  try {
    // Dynamically import undici fetch to avoid build-time worker thread evaluation crashes
    // @ts-ignore
    const { fetch: undiciFetch } = await import('undici')

    log.push('Starting database query for MCP server configs...')
    const configs = await prisma.mcpServerConfig.findMany()
    log.push(`Found ${configs.length} configs in database: ${JSON.stringify(configs.map((c: any) => ({ name: c.name, isActive: c.isActive }))) }`)

    for (const config of configs) {
      log.push(`\nTesting connection to server: ${config.name} ...`)
      try {
        const url = new URL(config.url)
        const headers = {
          'Accept': 'application/json, text/event-stream',
          ...((config.headers as Record<string, string>) || {})
        }
        
        log.push(`Configured header names: ${Object.keys(headers).join(", ")}`)
        
        // Pass undiciFetch to bypass Next.js global fetch caching/buffering patches!
        const transport = new StreamableHTTPClientTransport(url, {
          requestInit: { 
            headers,
            // @ts-ignore
            cache: 'no-store'
          },
          fetch: undiciFetch as any
        })

        const client = new Client({
          name: 'test-mcp-client',
          version: '1.0.0'
        }, {
          capabilities: {}
        })

        log.push('Connecting client...')
        
        // Use a timeout for the connect promise to avoid hanging the route
        const connectPromise = client.connect(transport)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout (10s)')), 10000)
        )
        
        await Promise.race([connectPromise, timeoutPromise])
        log.push('Connected successfully! Fetching tools list...')
        
        const toolsRes = await client.listTools()
        log.push(`Success! Found ${toolsRes.tools.length} tools.`)
        for (const t of toolsRes.tools) {
          log.push(` - ${t.name}: ${t.description} (input schema properties: ${Object.keys(t.inputSchema?.properties || {}).join(', ')})`)
        }
        
        await transport.close()
      } catch (err: any) {
        log.push(`Connection test failed for ${config.name}.`)
      }
    }

    return NextResponse.json({ ok: true, logs: log })
  } catch (globalErr: any) {
    return NextResponse.json({ ok: false, error: 'MCP diagnostic unavailable', logs: log })
  }
}
