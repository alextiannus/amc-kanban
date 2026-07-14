import { NextResponse } from 'next/server'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const log: string[] = []
  try {
    // Dynamically import undici fetch to avoid build-time worker thread evaluation crashes
    // @ts-ignore
    const { fetch: undiciFetch } = await import('undici')

    log.push('Starting database query for MCP server configs...')
    const configs = await prisma.mcpServerConfig.findMany()
    log.push(`Found ${configs.length} configs in database: ${JSON.stringify(configs.map((c: any) => ({ name: c.name, url: c.url, isActive: c.isActive }))) }`)

    for (const config of configs) {
      log.push(`\nTesting connection to server: ${config.name} (${config.url})...`)
      try {
        const url = new URL(config.url)
        const headers = {
          'Accept': 'application/json, text/event-stream',
          ...((config.headers as Record<string, string>) || {})
        }
        
        log.push(`Headers: ${JSON.stringify(headers)}`)
        
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
        log.push(`Error testing ${config.name}: ${err.message || err}`)
        if (err.stack) {
          log.push(err.stack)
        }
      }
    }

    return NextResponse.json({ ok: true, logs: log })
  } catch (globalErr: any) {
    return NextResponse.json({ ok: false, error: globalErr.message, logs: log })
  }
}
