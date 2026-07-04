import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function test() {
  console.log('--- CLI MCP Test Starting ---')
  const configs = await prisma.mcpServerConfig.findMany()
  console.log('Found configs:', JSON.stringify(configs.map(c => ({ name: c.name, url: c.url, isActive: c.isActive }))))

  for (const config of configs) {
    console.log(`\nTesting connection to server: ${config.name} (${config.url})...`)
    try {
      const url = new URL(config.url)
      const headers = {
        'Accept': 'application/json, text/event-stream',
        ...((config.headers as Record<string, string>) || {})
      }
      
      console.log('Using headers:', JSON.stringify(headers))
      
      const transport = new StreamableHTTPClientTransport(url, {
        requestInit: { 
          headers,
          // @ts-ignore
          cache: 'no-store'
        },
        fetch: globalThis.fetch
      })

      const client = new Client({
        name: 'test-mcp-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      })

      console.log('Connecting client...')
      
      // Connect with a promise race timeout of 10 seconds
      const connectPromise = client.connect(transport)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout (10s)')), 10000)
      )
      
      await Promise.race([connectPromise, timeoutPromise])
      console.log('Connected! Fetching tools list...')
      
      const toolsRes = await client.listTools()
      console.log(`Success! Found ${toolsRes.tools.length} tools:`)
      for (const t of toolsRes.tools) {
        console.log(` - ${t.name}: ${t.description}`)
      }

      await transport.close()
    } catch (e: any) {
      console.error('Failed to connect or test:', e.message || e)
      if (e.stack) {
        console.error(e.stack)
      }
    }
  }

  await prisma.$disconnect()
}

test().catch(console.error)
